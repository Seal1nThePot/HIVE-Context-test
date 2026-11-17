import {watch as watchDirectory} from 'node:fs';
import {randomUUID} from 'node:crypto';

// One current-workspace snapshot, one scan flight, and a bounded number of
// watcher handles. No timer scans an inactive workspace or retains its tree.
export function fileIndex(root, scan, options = {}) {
  const {fallbackMs = 60_000, maxCachedEntries = 25_000, maxCachedPathChars = 4_000_000,
    maxWatchers = 256, watch = watchDirectory, now = Date.now} = options;
  const instance = randomUUID();
  const counters = {scanCount:0, statCount:0, readdirCount:0, cacheHits:0, invalidations:0,
    watcherEvents:0, watcherErrors:0, maxPendingStats:0, scansFailed:0};
  let active = true, closed = false, dirty = true, generation = 0, revision = 0;
  let cached = null, fingerprint = null, lastScanAt = 0, flight = null;
  let ignored = relative => relative.split(/[\\/]/).some(part => part.startsWith('.') || part.toLowerCase() === 'node_modules');
  let cachedEntryCount = 0, cachedPathChars = 0;
  const watchers = new Map();
  const version = () => `${instance}:${revision}`;
  function invalidate() {dirty = true; generation++; counters.invalidations++;}
  function stopWatchers() {for (const watcher of watchers.values()) watcher.close(); watchers.clear();}
  function addWatcher(target, recursive) {
    if (!active || closed || watchers.has(target) || watchers.size >= maxWatchers) return;
    try {
      const watcher = watch(target, {recursive, persistent:false}, (_event, name) => {
        if (name && ignored(String(name))) return;
        counters.watcherEvents++; invalidate();
      });
      watchers.set(target, watcher);
      watcher.on('error', () => {
        counters.watcherErrors++; invalidate(); watcher.close();
        if (watchers.get(target) === watcher) watchers.delete(target);
      });
      watcher.on('close', () => {if (watchers.get(target) === watcher) watchers.delete(target);});
      watcher.unref?.();
    } catch {counters.watcherErrors++;}
  }
  function synchronizeWatchers(directories) {
    if (!active || closed) return;
    if (process.platform === 'win32' || process.platform === 'darwin') {
      addWatcher(root, true);
      if (watchers.size) return;
    }
    const selected = new Set([root, ...directories.slice(0, Math.max(0, maxWatchers - 1))]);
    for (const [target, watcher] of watchers) if (!selected.has(target)) {watcher.close(); watchers.delete(target);}
    for (const target of selected) addWatcher(target, false);
  }
  async function refresh() {
    if (flight) return flight;
    // Observe root changes before the first walk, including mutations racing
    // that walk. Additional bounded non-recursive handles are added afterward.
    addWatcher(root, process.platform === 'win32' || process.platform === 'darwin');
    const startedGeneration = generation;
    counters.scanCount++;
    const task = (async () => {
      try {
        const result = await scan(counters);
        // A switch/close may occur during IO. The captured caller gets its own
        // result, but the old workspace never reacquires a cache or watcher.
        if (active && !closed) {
          ignored = result.ignored;
          synchronizeWatchers(result.directories);
          const fits = result.count <= maxCachedEntries && result.pathChars <= maxCachedPathChars;
          cached = fits ? result.entries : null;
          cachedEntryCount = fits ? result.count : 0;
          cachedPathChars = fits ? result.pathChars : 0;
          lastScanAt = now();
        }
        if (fingerprint !== result.fingerprint) {fingerprint = result.fingerprint; revision++;}
        dirty = generation !== startedGeneration || !active || closed;
        return {treeVersion:version(), entries:result.entries};
      } catch (error) {dirty = true; counters.scansFailed++; throw error;}
    })();
    flight = task;
    try {return await task;} finally {if (flight === task) flight = null;}
  }
  async function snapshot({knownVersion, force = false} = {}) {
    let result;
    if (flight || force || dirty || !fingerprint || now() - lastScanAt >= fallbackMs || (!cached && knownVersion !== version()))
      result = await refresh();
    else {counters.cacheHits++; result = {treeVersion:version(), entries:cached};}
    return result.treeVersion === knownVersion ? {treeVersion:result.treeVersion} : result;
  }
  function suspend() {
    active = false; invalidate(); stopWatchers(); cached = null; cachedEntryCount = 0; cachedPathChars = 0;
  }
  function resume() {if (!closed) {active = true; invalidate();}}
  async function close() {closed = true; suspend(); await flight?.catch(() => {});}
  return {snapshot, invalidate, suspend, resume, close,
    debugStats:() => ({...counters, active:active && !closed, closed, inFlight:!!flight,
      watcherCount:watchers.size, cachedEntryCount, cachedPathChars, maxCachedEntries, maxWatchers})};
}
