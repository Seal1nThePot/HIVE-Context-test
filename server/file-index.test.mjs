import {beforeEach, afterEach, it, expect, vi} from 'vitest';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {EventEmitter} from 'node:events';
import {fileStore} from './files.mjs';
import {fileIndex} from './file-index.mjs';
import {workspaceStore} from './workspace.mjs';

let temp, root, stores;
beforeEach(async () => {temp = await fs.mkdtemp(path.join(os.tmpdir(), 'hive-index-')); root = path.join(temp, 'docs'); await fs.mkdir(root); stores = [];});
afterEach(async () => {vi.restoreAllMocks(); await Promise.all(stores.map(store => store.close())); await fs.rm(temp, {recursive:true, force:true});});
const make = options => {const store = fileStore(root, undefined, options); stores.push(store); return store;};
const names = entries => entries.map(entry => entry.name);
const fakeWatcher = () => {
  const listeners = [];
  const watch = (_target, _options, listener) => {
    const handle = new EventEmitter(); handle.close = vi.fn(); handle.unref = vi.fn();
    listeners.push({listener, handle}); return handle;
  };
  return {watch, listeners};
};

it('shares the initial scan and serves unchanged polling without stats or repeated entry payloads', async () => {
  await fs.writeFile(path.join(root, 'a.md'), 'a');
  const store = make();
  const requests = await Promise.all(Array.from({length:32}, () => store.snapshot()));
  const first = requests[0];
  expect(requests.every(item => item.treeVersion === first.treeVersion)).toBe(true);
  expect(first.treeVersion).toMatch(/^[0-9a-f-]+:1$/);
  const scanned = store.debugStats();
  for (let i = 0; i < 30; i++) expect(await store.snapshot({knownVersion:first.treeVersion})).toEqual({treeVersion:first.treeVersion});
  expect(store.debugStats()).toMatchObject({scanCount:1, statCount:scanned.statCount, cacheHits:30});
  expect(await store.snapshot({force:true, knownVersion:first.treeVersion})).toEqual({treeVersion:first.treeVersion});
  expect(store.debugStats().scanCount).toBe(2);
});

it('retains fresh list semantics and invalidates saves, folders, renames and arbitrary mutation transactions', async () => {
  const store = make({watch:() => {throw new Error('watch disabled');}});
  const first = await store.snapshot();
  await fs.writeFile(path.join(root, 'external.md'), 'external');
  expect(names(await store.list())).toEqual(['external.md']);
  let current = await store.snapshot();
  expect(current.treeVersion).not.toBe(first.treeVersion);
  const saved = await store.save({path:'a.md', text:'a', baseline:null});
  let next = await store.snapshot({knownVersion:current.treeVersion});
  expect(names(next.entries)).toEqual(['a.md', 'external.md']);
  await store.folder('folder'); current = await store.snapshot();
  await store.rename('a.md', 'folder/a.md', saved.hash); next = await store.snapshot({knownVersion:current.treeVersion});
  expect(next.entries[0].children[0].path).toBe('folder/a.md');
  await expect(store.transaction(async () => {await fs.writeFile(path.join(root, 'partial.md'), 'created'); throw new Error('partial');})).rejects.toThrow('partial');
  expect(names((await store.snapshot()).entries)).toContain('partial.md');
});

it('uses directory notifications for nested external create, rename and delete without forced scans', async () => {
  const store = make(); await fs.mkdir(path.join(root, 'nested'));
  let current = await store.snapshot();
  async function expectExternal(change, expected) {
    const events = store.debugStats().watcherEvents;
    await change();
    await vi.waitFor(() => expect(store.debugStats().watcherEvents).toBeGreaterThan(events), {timeout:2000, interval:10});
    current = await store.snapshot({knownVersion:current.treeVersion});
    expect(current.entries[0].children.map(entry => entry.name)).toEqual(expected);
  }
  await expectExternal(() => fs.writeFile(path.join(root, 'nested', 'a.md'), 'a'), ['a.md']);
  await expectExternal(() => fs.rename(path.join(root, 'nested', 'a.md'), path.join(root, 'nested', 'b.md')), ['b.md']);
  await expectExternal(() => fs.unlink(path.join(root, 'nested', 'b.md')), []);
});

it('falls back after 60 seconds when watching is unavailable', async () => {
  let clock = 0;
  const store = make({now:() => clock, watch:() => {throw new Error('unsupported');}});
  const first = await store.snapshot();
  await fs.writeFile(path.join(root, 'outside.md'), 'new');
  clock = 59_999;
  expect(await store.snapshot({knownVersion:first.treeVersion})).toEqual({treeVersion:first.treeVersion});
  clock = 60_000;
  expect(names((await store.snapshot({knownVersion:first.treeVersion})).entries)).toEqual(['outside.md']);
});

it('ignores atomic-save temporary names and settles back to cache hits after the final filename event', async () => {
  const watcher = fakeWatcher(), store = make({watch:watcher.watch});
  await fs.writeFile(path.join(root, 'a.md'), 'a');
  const first = await store.snapshot(), listener = watcher.listeners[0].listener;
  listener('rename', '.a.md.random.tmp');
  expect(await store.snapshot({knownVersion:first.treeVersion})).toEqual({treeVersion:first.treeVersion});
  expect(store.debugStats()).toMatchObject({scanCount:1, watcherEvents:0});
  listener('rename', 'a.md');
  expect(await store.snapshot({knownVersion:first.treeVersion})).toEqual({treeVersion:first.treeVersion});
  expect(store.debugStats()).toMatchObject({scanCount:2, watcherEvents:1});
  await store.snapshot({knownVersion:first.treeVersion});
  expect(store.debugStats().scanCount).toBe(2);
});

it('bounds pending stat work and drops oversized cached trees while preserving all entries', async () => {
  for (let i = 0; i < 300; i++) await fs.writeFile(path.join(root, `note-${i}.md`), 'x');
  const store = make({maxCachedEntries:50});
  const first = await store.snapshot();
  expect(first.entries).toHaveLength(300);
  expect(store.debugStats()).toMatchObject({maxPendingStats:16, cachedEntryCount:0});
  expect(await store.snapshot({knownVersion:first.treeVersion})).toEqual({treeVersion:first.treeVersion});
  expect(store.debugStats().scanCount).toBe(1);
  expect((await store.snapshot()).entries).toHaveLength(300);
});

it('excludes dependencies before walking them and preserves same-name output folders in ordinary workspaces', async () => {
  for (const name of ['node_modules', 'delivery', 'release', 'dist', 'performance', 'baselines']) {
    await fs.mkdir(path.join(root, name)); await fs.writeFile(path.join(root, name, 'keep.md'), name);
  }
  const store = make();
  expect(names(await store.list())).toEqual(expect.arrayContaining(['delivery', 'release', 'dist', 'performance', 'baselines']));
  expect(store.debugStats().statCount).toBe(10);
  expect((await store.read('node_modules/keep.md')).text).toBe('node_modules');
  await fs.mkdir(path.join(root, 'server')); await fs.mkdir(path.join(root, 'desktop'));
  await fs.writeFile(path.join(root, 'server', 'files.mjs'), ''); await fs.writeFile(path.join(root, 'desktop', 'main.mjs'), '');
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({name:'hive-writing-prototype', main:'desktop/main.mjs'}));
  expect(names(await store.list())).toEqual(['baselines', 'desktop', 'performance', 'server']);
});

it('limits HIVE output exclusions to root prefixes and preserves nested ordinary document folders', async () => {
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({name:'hive-writing-prototype', main:'desktop/main.mjs'}));
  for (const name of ['server', 'desktop', 'docs/delivery', 'performance/math-fixtures', 'performance/baselines', 'delivery', 'release', 'dist']) {
    await fs.mkdir(path.join(root, name), {recursive:true}); await fs.writeFile(path.join(root, name, 'note.md'), 'keep');
  }
  await fs.writeFile(path.join(root, 'server/files.mjs'), ''); await fs.writeFile(path.join(root, 'desktop/main.mjs'), '');
  const tree = await make().list();
  expect(names(tree)).toEqual(['desktop', 'docs', 'performance', 'server']);
  expect(tree.find(item => item.name === 'docs').children[0].path).toBe('docs/delivery');
  expect(names(tree.find(item => item.name === 'performance').children)).toEqual(['math-fixtures']);
  expect((await make({excludeDirectories:['docs/delivery']}).list()).find(item => item.name === 'docs').children).toEqual([]);
  for (const rule of ['../outside', '/absolute', 'C:/absolute', 'docs/../outside'])
    await expect(make({excludeDirectories:[rule]}).list()).rejects.toThrow('工作空间边界');
});

it.each(['scan', 'save'])('clears unpublished creation-time observations after a failed %s and persists them on retry', async operation => {
  const state = path.join(temp, 'state'); await fs.mkdir(state);
  const store = fileStore(root, state); stores.push(store);
  const target = path.join(state, 'file-times.json'), original = fs.rename.bind(fs);
  let failOnce = true;
  const spy = vi.spyOn(fs, 'rename').mockImplementation(async (from, to, ...args) => {
    if (to === target && failOnce) {failOnce = false; throw Object.assign(new Error('metadata write failed'), {code:'EACCES'});}
    return original(from, to, ...args);
  });
  if (operation === 'scan') {
    await fs.writeFile(path.join(root, 'a.md'), 'a');
    await expect(store.snapshot()).rejects.toThrow('metadata write failed');
  } else await expect(store.save({path:'a.md', text:'a', baseline:null})).rejects.toThrow('metadata write failed');
  spy.mockRestore();
  expect(names((await store.snapshot()).entries)).toEqual(['a.md']);
  expect(JSON.parse(await fs.readFile(target, 'utf8'))['a.md'].createdAt).toBeGreaterThan(0);
});

it('does not follow linked files or folders and preserves direct-path link protections', async () => {
  await fs.writeFile(path.join(temp, 'outside.md'), 'outside');
  await fs.mkdir(path.join(temp, 'outside-dir')); await fs.writeFile(path.join(temp, 'outside-dir', 'note.md'), 'outside');
  await fs.symlink(path.join(temp, 'outside-dir'), path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const store = make();
  expect(await store.list()).toEqual([]);
  await expect(store.read('linked/note.md')).rejects.toThrow('符号链接');
  await expect(store.save({path:'linked/new.md', text:'blocked', baseline:null})).rejects.toThrow('符号链接');
});

it('rejects partial scan failures without replacing the old snapshot and recovers on the next request', async () => {
  const store = make(); await fs.writeFile(path.join(root, 'good.md'), 'a');
  const first = await store.snapshot();
  await fs.writeFile(path.join(root, 'new.md'), 'new');
  const original = fs.lstat.bind(fs);
  const spy = vi.spyOn(fs, 'lstat').mockImplementation(async (target, ...args) => {
    if (String(target).endsWith('new.md')) throw Object.assign(new Error('denied'), {code:'EACCES'});
    return original(target, ...args);
  });
  await expect(store.snapshot({force:true})).rejects.toThrow('denied');
  spy.mockRestore();
  const recovered = await store.snapshot({knownVersion:first.treeVersion});
  expect(names(recovered.entries)).toEqual(['good.md', 'new.md']);
  expect(store.debugStats().scansFailed).toBe(1);
});

it('does not lose invalidation during a scan and never repopulates a suspended or closed index', async () => {
  let release;
  const result = {entries:[], fingerprint:'same', count:0, pathChars:0, directories:[], ignored:() => false};
  const scan = vi.fn(() => new Promise(resolve => {release = () => resolve(result);}));
  const watcher = fakeWatcher(), index = fileIndex(root, scan, {watch:watcher.watch}); stores.push(index);
  const pending = index.snapshot(); index.invalidate(); release(); await pending;
  const next = index.snapshot(); expect(scan).toHaveBeenCalledTimes(2);
  index.suspend(); release(); await next;
  expect(index.debugStats()).toMatchObject({active:false, watcherCount:0, cachedEntryCount:0});
  index.resume();
  const final = index.snapshot(), closing = index.close(); release(); await final; await closing;
  expect(index.debugStats()).toMatchObject({closed:true, watcherCount:0, inFlight:false, cachedEntryCount:0});
});

it('releases watchers and cached entries on workspace switching while captured requests keep their original root', async () => {
  const other = path.join(temp, 'other'); await fs.mkdir(other);
  const spaces = await workspaceStore(path.join(temp, 'state'), root); stores.push(spaces);
  const captured = spaces.capture(); await captured.files.snapshot();
  expect(captured.files.debugStats().watcherCount).toBeGreaterThan(0);
  await spaces.update({root:other, revision:0});
  expect(captured.files.debugStats()).toMatchObject({active:false, watcherCount:0, cachedEntryCount:0});
  await captured.files.save({path:'old-request.md', text:'old', baseline:null});
  await expect(spaces.capture().files.read('old-request.md')).rejects.toMatchObject({code:'ENOENT'});
  await spaces.update({root, revision:1});
  expect(spaces.capture()).toBe(captured);
  expect(names((await captured.files.snapshot()).entries)).toContain('old-request.md');
  await spaces.close();
  expect(captured.files.debugStats()).toMatchObject({closed:true, watcherCount:0, cachedEntryCount:0});
});
