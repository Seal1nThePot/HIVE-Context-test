import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileStore} from './files.mjs';
import {importStore} from './imports.mjs';
import {imageStore} from './images.mjs';
import {explorerStore} from './explorer.mjs';
import {trashRetention} from './trash-retention.mjs';
import {resolveReferences} from './references.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=','base64');
let root,state,files,space,explorer;
beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'hive-file-feedback-'));state=path.join(root,'state');await fs.mkdir(state);files=fileStore(root,state);space={root,state,files};explorer=explorerStore(space);await fs.mkdir(path.join(root,'资料'));});
afterEach(async()=>{files.close();if(!path.basename(root).startsWith('hive-file-feedback-'))throw new Error('Unexpected cleanup');await fs.rm(root,{recursive:true,force:true});});
describe('file feedback behavior',()=>{
  it('imports both kinds into the selected folder, indexes image formats, and keeps text references binary-free',async()=>{
    const imports=importStore(space);expect((await imports.store('图.PNG',png,'资料')).path).toBe('资料/图.png');
    expect((await imports.store('稿.md',Buffer.from('needle'),'资料')).path).toBe('资料/稿.md');
    const tree=await files.list();expect(tree.find(item=>item.path==='资料').children.map(item=>item.name)).toEqual(expect.arrayContaining(['图.png','稿.md']));
    expect((await explorer.search('资料','图')).matches).toEqual([{path:'资料/图.png',line:null,excerpt:''}]);
    const refs=await resolveReferences(space,{sources:[{path:'资料',type:'folder'}],budget:100});expect(refs.files.map(item=>item.path)).toEqual(['资料/稿.md']);expect(refs.warnings).toEqual([]);
    await expect(imports.store('稿.md',Buffer.from('x'),'../outside')).rejects.toMatchObject({status:400});
    await expect(imports.store('稿.md',Buffer.from('x'),'资料/稿.md')).rejects.toThrow('文件夹');
  });
  it('reads images directly, preserves bytes through rename/copy/trash/restore, and rejects unsafe or invalid files',async()=>{
    await fs.writeFile(path.join(root,'资料','图.png'),png);const images=imageStore(space);
    expect((await images.readFile('资料/图.png')).buffer).toEqual(png);
    for(const value of ['../图.png','资料/稿.md','C:\\图.png'])await expect(images.readFile(value)).rejects.toMatchObject({status:400});
    await fs.writeFile(path.join(root,'资料','坏.png'),'text');await expect(images.readFile('资料/坏.png')).rejects.toMatchObject({status:400});
    const renamed=await explorer.manage({action:'rename',path:'资料/图.png',name:'新图.png'});expect(renamed.path).toBe('资料/新图.png');
    const copy=await explorer.manage({action:'duplicate',path:renamed.path});expect(copy.path).toBe('资料/新图 副本.png');
    const record=await explorer.manage({action:'trash',path:renamed.path});await explorer.manage({action:'restore',id:record.id});expect((await images.readFile(renamed.path)).buffer).toEqual(png);
  });
  it('purges qualifying old entries immediately while retaining fresh ones until an explicit all-items confirmation',async()=>{
    await files.save({path:'旧.md',text:'old',baseline:null});await files.save({path:'新.md',text:'new',baseline:null});
    const old=await explorer.manage({action:'trash',path:'旧.md'}),fresh=await explorer.manage({action:'trash',path:'新.md'});
    const manifest=path.join(root,'.hive-trash',old.id+'.json');const record=JSON.parse(await fs.readFile(manifest,'utf8'));record.deletedAt=new Date(Date.now()-31*86400000).toISOString();await fs.writeFile(manifest,JSON.stringify(record));
    const retention=trashRetention(space),preview=await retention.preview(30);expect(preview.items.map(item=>item.id)).toEqual([old.id]);
    const result=await retention.purge(preview.token);expect(result).toEqual({deletedIds:[old.id],failed:[]});
    await expect(fs.stat(path.join(root,'.hive-trash',old.id))).rejects.toMatchObject({code:'ENOENT'});expect((await retention.list()).map(item=>item.id)).toEqual([fresh.id]);
    const all=await retention.preview(0);expect(all.count).toBe(1);expect((await retention.list()).length).toBe(1);await retention.purge(all.token);expect(await retention.list()).toEqual([]);
  });
});
