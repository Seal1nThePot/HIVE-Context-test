import {beforeEach,afterEach,it,expect} from 'vitest';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {EventEmitter} from 'node:events';
import {fileStore} from './files.mjs';
import {explorerStore} from './explorer.mjs';
let root,state,files,explorer,base;
beforeEach(async()=>{base=await fs.mkdtemp(path.join(os.tmpdir(),'hive-explorer-'));root=path.join(base,'docs');state=path.join(base,'state');await fs.mkdir(root);await fs.mkdir(state);files=fileStore(root);explorer=explorerStore({root,state,files});});
afterEach(async()=>{await fs.rm(base,{recursive:true,force:true});});
it('creates unique default notes and folders immediately, retaining existing content',async()=>{
  const values=await Promise.all(Array.from({length:3},()=>explorer.manage({action:'create',type:'file'})));
  expect(values.map(v=>v.path)).toEqual(['新建文档.md','新建文档 2.md','新建文档 3.md']);
  expect(await explorer.manage({action:'create',type:'folder'})).toMatchObject({path:'新建文件夹'});
  expect(await explorer.manage({action:'create',type:'file',parent:'新建文件夹'})).toMatchObject({path:'新建文件夹/新建文档.md'});
  expect((await files.list())[0].modifiedAt).toBeGreaterThan(0);
});
it('moves folders with their notes, annotations and outlines and restores them after deletion',async()=>{
  await files.save({path:'a/note.md',text:'body',baseline:null});await files.folder('b');
  await fs.writeFile(path.join(state,'text-annotations.json'),JSON.stringify({'document:a/note.md':{revision:1,items:[{id:'one',file:'a/note.md'}]},'scratch:自由草稿':{items:[]}}));
  await fs.writeFile(path.join(state,'writing-outline-nodes.json'),JSON.stringify({'a/note.md':{revision:2,nodes:[{title:'Node'}]}}));
  await explorer.manage({action:'move',path:'a',parent:'b'});
  expect((await files.read('b/a/note.md')).text).toBe('body');
  const annotations=JSON.parse(await fs.readFile(path.join(state,'text-annotations.json')));
  expect(annotations['document:b/a/note.md'].items[0].file).toBe('b/a/note.md');expect(annotations['scratch:自由草稿']).toBeDefined();
  const deleted=await explorer.manage({action:'trash',path:'b/a'});
  expect(await explorer.listTrash()).toHaveLength(1);expect(JSON.stringify(await files.list())).not.toContain('.hive-trash');
  await explorer.manage({action:'restore',id:deleted.id});
  expect((await files.read('b/a/note.md')).text).toBe('body');expect(await explorer.listTrash()).toHaveLength(0);
  expect(JSON.parse(await fs.readFile(path.join(state,'writing-outline-nodes.json')))['b/a/note.md'].nodes[0].title).toBe('Node');
});
it('does not overwrite a collision while renaming, moving or restoring',async()=>{
  await files.save({path:'a.md',text:'first',baseline:null});await files.save({path:'b.md',text:'second',baseline:null});
  await expect(explorer.manage({action:'rename',path:'a.md',name:'b.md'})).rejects.toMatchObject({status:409});
  const deleted=await explorer.manage({action:'trash',path:'a.md'});await files.save({path:'a.md',text:'new',baseline:null});
  await expect(explorer.manage({action:'restore',id:deleted.id})).rejects.toMatchObject({status:409});
  expect((await files.read('a.md')).text).toBe('new');expect(await explorer.listTrash()).toHaveLength(1);
});
it('duplicates all ordinary folder contents without changing the source',async()=>{
  await files.save({path:'folder/a.md',text:'original',baseline:null});await fs.writeFile(path.join(root,'folder','image.png'),'image');
  await explorer.manage({action:'duplicate',path:'folder'});expect((await files.read('folder 副本/a.md')).text).toBe('original');expect(await fs.readFile(path.join(root,'folder 副本/image.png'),'utf8')).toBe('image');
});
it('rejects self-descendant moves, traversal, unsupported files and reserved names',async()=>{
  await files.save({path:'folder/sub/a.md',text:'x',baseline:null});await fs.writeFile(path.join(root,'data.txt'),'x');
  for(const input of [{action:'move',path:'folder',parent:'folder/sub'},{action:'create',parent:'../outside'},{action:'trash',path:'data.txt'},{action:'rename',path:'folder/sub/a.md',name:'NUL'},{action:'rename',path:'folder/sub/a.md',name:'x/y'}])await expect(explorer.manage(input)).rejects.toThrow();
  expect((await files.read('folder/sub/a.md')).text).toBe('x');
});
it('rolls a filesystem move back if metadata cannot be migrated',async()=>{
  await files.save({path:'a.md',text:'original',baseline:null});await fs.writeFile(path.join(state,'writing-outline-nodes.json'),'broken JSON');
  await expect(explorer.manage({action:'rename',path:'a.md',name:'new.md'})).rejects.toThrow();expect((await files.read('a.md')).text).toBe('original');
});
it('serializes saves with structural moves so an old save cannot recreate the source',async()=>{
  const result=await files.save({path:'a.md',text:'original',baseline:null});
  const moving=explorer.manage({action:'rename',path:'a.md',name:'new.md'}),saving=files.save({path:'a.md',text:'late',baseline:result.hash});
  await moving;await expect(saving).rejects.toMatchObject({status:409});expect((await files.read('new.md')).text).toBe('original');
});
it('passes an ordinary absolute file path to Windows Explorer without a shell',async()=>{
  if(process.platform!=='win32')return;await files.save({path:'a & b.md',text:'x',baseline:null});let args;
  const launcher=(...values)=>{args=values;const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;};
  await explorerStore({root,state,files},launcher).manage({action:'reveal',path:'a & b.md'});
  expect(args[0]).toBe('explorer.exe');expect(args[1]).toEqual(['/select,',path.join(root,'a & b.md')]);expect(args[2].shell).toBe(false);
});

it('searches names and body text only in the selected folder and its descendants',async()=>{
  await files.save({path:'one/nested/a.md',text:'# Title\nA unique needle here.',baseline:null});
  await files.save({path:'other/b.md',text:'needle outside',baseline:null});
  const found=await explorer.search('one','needle');expect(found.matches).toEqual([{path:'one/nested/a.md',line:2,excerpt:'# Title A unique needle here.'}]);
  expect((await explorer.search('one','a.md')).matches).toHaveLength(1);
  await expect(explorer.search('../outside','needle')).rejects.toThrow();
});
