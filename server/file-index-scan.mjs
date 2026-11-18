import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {indexPolicy} from './index-policy.mjs';
import {isDocumentPath} from './file-kinds.mjs';

const vanished = error => error.code === 'ENOENT' || error.code === 'ENOTDIR';
const order = (a, b) => a.type === b.type
  ? a.name.localeCompare(b.name, 'zh-CN') || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  : a.type === 'folder' ? -1 : 1;

// Directory streams and batches bound both IO and promises. In particular,
// node_modules is rejected before opening it or allocating jobs for its files.
export async function scanFileTree({root, dir = root, prefix = '', times, options = {}, counters}) {
  const policy = await indexPolicy(root, options), batchSize = 16;
  const timeData = times ? await times.read() : null;
  let timesChanged = false, count = 0, pathChars = 0;
  const directories = [], watcherLimit = Math.max(0, (options.maxWatchers ?? 256) - 1);
  async function directory(target, relativePrefix) {
    counters.readdirCount++;
    const stream = await fs.opendir(target), result = [];
    async function consume(batch) {
      counters.maxPendingStats = Math.max(counters.maxPendingStats, batch.length);
      const settled = await Promise.allSettled(batch.map(async entry => {
        const relative = relativePrefix + entry.name;
        counters.statCount++;
        try {return {name:entry.name, relative, stat:await fs.lstat(path.join(target, entry.name))};}
        catch (error) {if (vanished(error)) return null; throw error;}
      }));
      // Wait for the complete bounded batch before rejecting so no abandoned
      // stats can overlap the next failed-scan retry.
      const failure = settled.find(item => item.status === 'rejected');
      if (failure) throw failure.reason;
      for (const item of settled) {
        const value = item.value;
        if (!value || value.stat.isSymbolicLink() || (!value.stat.isDirectory() && (!value.stat.isFile() || !isDocumentPath(value.name)))) continue;
        const {name, relative, stat} = value;
        const entry = {name, path:relative, type:stat.isDirectory() ? 'folder' : 'file', modifiedAt:stat.mtimeMs};
        if (stat.isDirectory()) {
          const child = path.join(target, name);
          try {entry.children = await directory(child, relative + '/');}
          catch (error) {if (vanished(error)) continue; throw error;}
          if (directories.length < watcherLimit) directories.push(child);
        }
        const observed = times ? times.observe(timeData, relative, stat) : {createdAt:stat.birthtimeMs, dirty:false};
        entry.createdAt = observed.createdAt; timesChanged ||= observed.dirty;
        result.push(Object.freeze(entry)); count++; pathChars += relative.length + name.length;
      }
    }
    let batch = [];
    try {
      for await (const entry of stream) {
        if (policy.ignored(relativePrefix + entry.name) || entry.isSymbolicLink() || (!entry.isDirectory() && !isDocumentPath(entry.name))) continue;
        batch.push(entry);
        if (batch.length === batchSize) {await consume(batch); batch = [];}
      }
      if (batch.length) await consume(batch);
    } finally {await stream.close().catch(error => {if (error.code !== 'ERR_DIR_CLOSED') throw error;});}
    return Object.freeze(result.sort(order));
  }
  const entries = await directory(dir, prefix);
  if (times && timesChanged) await times.write(timeData);
  // Hash small tuples in stable tree order; never stringify a second full tree.
  const fingerprint = createHash('sha256');
  function digest(items) {
    for (const entry of items) {
      fingerprint.update(JSON.stringify([entry.path, entry.type, entry.modifiedAt, entry.createdAt]) + '\n');
      if (entry.children) digest(entry.children);
    }
  }
  digest(entries);
  return {entries, fingerprint:fingerprint.digest('hex'), count, pathChars, directories, ignored:policy.ignored};
}
