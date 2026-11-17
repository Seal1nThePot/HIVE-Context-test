import {promises as fs} from 'node:fs';
import path from 'node:path';

// Generated-output names are also perfectly valid manuscript folders. Only the
// HIVE source checkout (or an explicit caller policy) opts out of those names.
export async function indexPolicy(root, {excludeDirectories = []} = {}) {
  if (!Array.isArray(excludeDirectories)) throw new TypeError('索引排除规则必须是工作空间内的相对目录路径。');
  const excluded = new Set(excludeDirectories.map(value => {
    if (typeof value !== 'string') throw new TypeError('索引排除规则必须是相对目录路径。');
    const relative = value.replace(/\\/g, '/').replace(/\/+$/, '');
    if (!relative || /[:\0]/.test(relative) || relative.split('/').some(part => !part || part === '.' || part === '..'))
      throw new TypeError('索引排除规则不能越过工作空间边界。');
    return relative.toLowerCase();
  }));
  try {
    const target = path.join(root, 'package.json'), stat = await fs.lstat(target);
    if (stat.isFile() && !stat.isSymbolicLink() && stat.size <= 64_000) {
      const manifest = JSON.parse(await fs.readFile(target, 'utf8'));
      if (manifest.name === 'hive-writing-prototype' && manifest.main === 'desktop/main.mjs') {
        const markers = await Promise.all(['server/files.mjs', 'desktop/main.mjs'].map(name => fs.lstat(path.join(root, name))));
        if (markers.every(item => item.isFile() && !item.isSymbolicLink()))
          for (const name of ['delivery', 'release', 'dist', 'performance/baselines']) excluded.add(name);
      }
    }
  } catch (error) {
    // Package metadata is optional; malformed/inaccessible metadata never hides documents.
    if (!['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'].includes(error.code) && !(error instanceof SyntaxError)) throw error;
  }
  const ignored = relative => {
    const segments = relative.replace(/\\/g, '/').toLowerCase().split('/');
    if (segments.some(part => part.startsWith('.') || part === 'node_modules')) return true;
    for (let count = 1; count <= segments.length; count++)
      if (excluded.has(segments.slice(0, count).join('/'))) return true;
    return false;
  };
  return {ignored};
}
