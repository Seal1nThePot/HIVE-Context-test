import {beforeEach,afterEach,it,expect} from 'vitest';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileStore} from './files.mjs';
import {explorerStore} from './explorer.mjs';
let base,root,state,files,explorer;
beforeEach(async()=>{base=await fs.mkdtemp(path.join(os.tmpdir(),'hive-times-'));root=path.join(base,'docs');state=path.join(base,'state');await fs.mkdir(root);await fs.mkdir(state);files=fileStore(root,state);explorer=explorerStore({root,state,files});});
afterEach(async()=>{const resolved=path.resolve(base);if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('hive-times-'))throw new Error('Unexpected test cleanup path');await fs.rm(resolved,{recursive:true,force:true});});
const flatten=tree=>tree.flatMap(item=>[item,...flatten(item.children||[])]);
const find=(tree,name)=>flatten(tree).find(item=>item.path===name);
it('keeps creation time through atomic saves and store restart',async()=>{
  let saved=await files.save({path:'a.md',text:'first',baseline:null});
  const created=find(await files.list(),'a.md').createdAt;
  for(let i=0;i<2;i++) saved=await files.save({path:'a.md',text:`edit ${i}`,baseline:saved.hash});
  expect(find(await files.list(),'a.md').createdAt).toBe(created);
  expect(find(await fileStore(root,state).list(),'a.md').createdAt).toBe(created);
});
it('migrates folder and file timestamps through moves and trash restore, but copies get their own',async()=>{
  let saved=await files.save({path:'folder/a.md',text:'first',baseline:null});
  const first=await files.list(), folderTime=find(first,'folder').createdAt, noteTime=find(first,'folder/a.md').createdAt;
  saved=await files.save({path:'folder/a.md',text:'edited',baseline:saved.hash});
  await explorer.manage({action:'rename',path:'folder',name:'renamed'});
  let tree=await files.list();expect(find(tree,'renamed').createdAt).toBe(folderTime);expect(find(tree,'renamed/a.md').createdAt).toBe(noteTime);
  const deleted=await explorer.manage({action:'trash',path:'renamed'});await explorer.manage({action:'restore',id:deleted.id});
  tree=await files.list();expect(find(tree,'renamed/a.md').createdAt).toBe(noteTime);
  await explorer.manage({action:'duplicate',path:'renamed/a.md'});
  tree=await files.list();const copy=find(tree,'renamed/a 副本.md');
  expect(copy.createdAt).toBe((await fs.stat(path.join(root,'renamed','a 副本.md'))).birthtimeMs);
});
it('uses the new identity after an external replacement at the same path',async()=>{
  await files.save({path:'a.md',text:'first',baseline:null});await files.list();
  await fs.writeFile(path.join(root,'replacement.tmp'),'external');
  await fs.rename(path.join(root,'replacement.tmp'),path.join(root,'a.md'));
  const stat=await fs.stat(path.join(root,'a.md'));
  expect(find(await files.list(),'a.md').createdAt).toBe(stat.birthtimeMs);
});
it('rejects a symlink as the state file',async()=>{
  const outside=path.join(base,'outside.json');await fs.writeFile(outside,'{}');
  try{await fs.symlink(outside,path.join(state,'file-times.json'),'file');}catch(error){if(error.code==='EPERM')return;throw error;}
  await expect(files.list()).rejects.toThrow('状态文件不可用');
  expect(await fs.readFile(outside,'utf8')).toBe('{}');
});
it('persists legal folder names that match Object prototype names',async()=>{
  await fs.mkdir(path.join(root,'__proto__'));await fs.writeFile(path.join(root,'__proto__','a.md'),'正文');
  const first=find(await files.list(),'__proto__').createdAt;
  const records=JSON.parse(await fs.readFile(path.join(state,'file-times.json'),'utf8'));expect(Object.hasOwn(records,'__proto__')).toBe(true);
  await explorer.manage({action:'rename',path:'__proto__',name:'constructor'});
  expect(find(await files.list(),'constructor').createdAt).toBe(first);
});

