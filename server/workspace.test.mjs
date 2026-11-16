import {beforeEach,afterEach,it,expect} from 'vitest';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {workspaceStore} from './workspace.mjs';
let temp,local,root,other,spaces;
beforeEach(async()=>{
  temp=await fs.mkdtemp(path.join(os.tmpdir(),'hive-workspaces-'));
  local=path.join(temp,'state');root=path.join(temp,'A');other=path.join(temp,'B');
  await fs.mkdir(other);spaces=await workspaceStore(local,root);
});
afterEach(async()=>{await fs.rm(temp,{recursive:true,force:true});});
it('persists the chosen root and automatic-save preference across restart',async()=>{
  const initial=spaces.read();
  const changed=await spaces.update({root:other,autoSave:false,revision:initial.revision});
  const restarted=await workspaceStore(local,root);
  expect(restarted.read()).toEqual(changed);
  expect(changed.root).toBe(await fs.realpath(other));
});
it('isolates same-name files and metadata and restores the original namespace',async()=>{
  const first=spaces.read(),old=spaces.capture(first.id);
  await old.files.save({path:'same.md',text:'A',baseline:null});
  await old.outlines.save('same.md','heading','A 的描述');
  await spaces.update({root:other,revision:0});
  const current=spaces.capture(spaces.read().id);
  await current.files.save({path:'same.md',text:'B',baseline:null});
  expect(await current.outlines.read('same.md')).toEqual({});
  await current.outlines.save('same.md','heading','B 的描述');
  await spaces.update({root,revision:1});
  const restored=spaces.capture(first.id);
  expect(restored).toBe(old);
  expect((await restored.files.read('same.md')).text).toBe('A');
  expect(await restored.outlines.read('same.md')).toEqual({heading:'A 的描述'});
});
it('rejects stale windows while captured requests remain bound to their original folder',async()=>{
  const first=spaces.read(),captured=spaces.capture(first.id);
  await spaces.update({root:other,revision:0});
  expect(()=>spaces.capture(first.id)).toThrow('其他窗口切换');
  await captured.files.save({path:'old-request.md',text:'old',baseline:null});
  await expect(spaces.capture().files.read('old-request.md')).rejects.toHaveProperty('code','ENOENT');
});
it('does not mutate the root or revision after invalid folder selection',async()=>{
  const before=spaces.read();
  await expect(spaces.update({root:path.join(temp,'missing'),revision:0})).rejects.toThrow('无法访问');
  await expect(spaces.update({root:'relative/path',revision:0})).rejects.toThrow('绝对路径');
  expect(spaces.read()).toEqual(before);
  await spaces.update({autoSave:false,revision:0});
  expect(spaces.read().autoSave).toBe(false);
});
it('serializes simultaneous changes and rejects an old revision',async()=>{
  const results=await Promise.allSettled([spaces.update({root:other,revision:0}),spaces.update({autoSave:false,revision:0})]);
  expect(results.map(result=>result.status)).toEqual(['fulfilled','rejected']);
  expect(spaces.read().root).toBe(await fs.realpath(other));
  expect(spaces.read().revision).toBe(1);
});
it('does not copy or overwrite documents when switching folders',async()=>{
  await fs.writeFile(path.join(other,'自由草稿.md'),'B scratch');
  await spaces.capture().files.save({path:'only-A.md',text:'A',baseline:null});
  await spaces.update({root:other,revision:0});
  expect((await spaces.capture().files.read('自由草稿.md')).text).toBe('B scratch');
  await expect(fs.access(path.join(other,'only-A.md'))).rejects.toThrow();
});
it('migrates legacy scratch only for the original workspace',async()=>{
  const state=path.join(temp,'legacy-state'),docs=path.join(temp,'legacy-docs');
  await fs.mkdir(state);await fs.writeFile(path.join(state,'scratch.md'),'legacy scratch');
  const legacy=await workspaceStore(state,docs);
  expect((await legacy.capture().files.read('自由草稿.md')).text).toBe('legacy scratch');
  await legacy.update({root:other,revision:0});
  await expect(fs.access(path.join(other,'自由草稿.md'))).rejects.toThrow();
});
