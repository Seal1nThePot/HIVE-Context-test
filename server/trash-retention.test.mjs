import {it,expect} from 'vitest';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileStore} from './files.mjs';
import {explorerStore} from './explorer.mjs';

it('previews strict age boundaries and purges only confirmed records and metadata',async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'hive-retention-'));const root=path.join(base,'docs'),state=path.join(base,'state');await fs.mkdir(root);await fs.mkdir(state);
 try{let now=Date.parse('2026-11-16T00:00:00Z');const files=fileStore(root),store=explorerStore({root,state,files},undefined,{now:()=>now});
 async function add(name,age){await fs.writeFile(path.join(root,name),'content');const item=await store.manage({action:'trash',path:name});item.deletedAt=new Date(now-age*86400000).toISOString();await fs.writeFile(path.join(root,'.hive-trash',item.id+'.json'),JSON.stringify(item));return item;}
 const old=await add('old.md',8),boundary=await add('boundary.md',7);
 for(const days of [7,15,30,90])expect((await store.previewTrash(days)).days).toBe(days);
 await expect(store.previewTrash(8)).rejects.toMatchObject({status:400});
 for(const name of ['text-annotations.json','writing-outline-nodes.json','writing-outlines.json','file-times.json'])await fs.writeFile(path.join(state,name),JSON.stringify({[name==='text-annotations.json'?'document:@trash/'+old.id:'@trash/'+old.id]:{},keep:{}}));
 const preview=await store.previewTrash(7);expect(preview.items.map(x=>x.id)).toEqual([old.id]);const late=await add('late.md',20);
 expect(await store.purgeTrash(preview.token)).toEqual({deletedIds:[old.id],failed:[]});await expect(store.purgeTrash(preview.token)).rejects.toMatchObject({status:409});expect((await store.listTrash()).map(x=>x.id)).toEqual(expect.arrayContaining([boundary.id,late.id]));
 for(const name of ['text-annotations.json','writing-outline-nodes.json','writing-outlines.json','file-times.json'])expect(Object.keys(JSON.parse(await fs.readFile(path.join(state,name),'utf8')))).toEqual(['keep']);
 const expired=await store.previewTrash(7);now+=300000;await expect(store.purgeTrash(expired.token)).rejects.toMatchObject({status:409});
 const changed=await store.previewTrash(7);await fs.writeFile(path.join(root,'.hive-trash',late.id),'changed');await expect(store.purgeTrash(changed.token)).rejects.toMatchObject({status:409});
 const other=explorerStore({root,state,files});await expect(other.purgeTrash((await store.previewTrash(7)).token)).rejects.toMatchObject({status:409});
 await fs.rm(path.join(root,'.hive-trash',late.id));expect((await store.listTrash()).find(x=>x.id===late.id).missing).toBe(true);
 }finally{const resolved=path.resolve(base),tmp=path.resolve(os.tmpdir());if(path.dirname(resolved)!==tmp||!path.basename(resolved).startsWith('hive-retention-'))throw Error('unsafe test cleanup');await fs.rm(resolved,{recursive:true,force:true});}
});

it('rejects linked trash data and removes an orphan manifest without touching its original path',async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'hive-retention-'));const root=path.join(base,'docs'),state=path.join(base,'state');await fs.mkdir(root);await fs.mkdir(state);
 try{const now=Date.now(),files=fileStore(root),store=explorerStore({root,state,files},undefined,{now:()=>now});await fs.writeFile(path.join(root,'a.md'),'original');const item=await store.manage({action:'trash',path:'a.md'}),trash=path.join(root,'.hive-trash'),manifest=path.join(trash,item.id+'.json');item.deletedAt=new Date(now-8*86400000).toISOString();await fs.writeFile(manifest,JSON.stringify(item));
 await fs.unlink(path.join(trash,item.id));await fs.writeFile(path.join(root,'a.md'),'new original');
 try{await fs.symlink(path.join(root,'a.md'),path.join(trash,item.id),'file');await expect(store.previewTrash(7)).rejects.toMatchObject({status:409});await fs.unlink(path.join(trash,item.id));}catch(e){if(!['EPERM','EACCES','ENOSYS'].includes(e.code))throw e;}
 const preview=await store.previewTrash(7);expect(preview.items[0].missing).toBe(true);expect((await store.purgeTrash(preview.token)).deletedIds).toEqual([item.id]);expect(await fs.readFile(path.join(root,'a.md'),'utf8')).toBe('new original');
 }finally{const resolved=path.resolve(base),tmp=path.resolve(os.tmpdir());if(path.dirname(resolved)!==tmp||!path.basename(resolved).startsWith('hive-retention-'))throw Error('unsafe test cleanup');await fs.rm(resolved,{recursive:true,force:true});}
});

it('lists and previews unselected folders without walking their contents, and caps preview tokens',async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'hive-retention-'));const root=path.join(base,'docs'),state=path.join(base,'state');await fs.mkdir(root);await fs.mkdir(state);
 try{let now=Date.now();const files=fileStore(root),store=explorerStore({root,state,files},undefined,{now:()=>now});await fs.mkdir(path.join(root,'folder'));await fs.writeFile(path.join(root,'folder','note.md'),'body');const item=await store.manage({action:'trash',path:'folder'}),folder=path.join(root,'.hive-trash',item.id);let link=false;try{await fs.symlink(path.join(root,'outside'),path.join(folder,'link'),'file');link=true;}catch(e){if(!['EPERM','EACCES','ENOSYS'].includes(e.code))throw e;}
 expect((await store.listTrash()).map(x=>x.id)).toEqual([item.id]);expect((await store.previewTrash(7)).count).toBe(0);
 if(link){now+=8*86400000;await expect(store.previewTrash(7)).rejects.toMatchObject({status:409});await fs.unlink(path.join(folder,'link'));}
 const first=await store.previewTrash(7);for(let i=0;i<32;i++)await store.previewTrash(7);await expect(store.purgeTrash(first.token)).rejects.toMatchObject({status:409});
 }finally{const resolved=path.resolve(base),tmp=path.resolve(os.tmpdir());if(path.dirname(resolved)!==tmp||!path.basename(resolved).startsWith('hive-retention-'))throw Error('unsafe test cleanup');await fs.rm(resolved,{recursive:true,force:true});}
});

it('preserves unpreviewed files added during deletion and reports partial deletion',async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'hive-retention-')),root=path.join(base,'docs'),state=path.join(base,'state');await fs.mkdir(root);await fs.mkdir(state);const unlink=fs.unlink;
 try{const now=Date.now(),files=fileStore(root),store=explorerStore({root,state,files},undefined,{now:()=>now});await fs.mkdir(path.join(root,'folder'));await fs.writeFile(path.join(root,'folder','a.md'),'a');const item=await store.manage({action:'trash',path:'folder'}),trash=path.join(root,'.hive-trash'),data=path.join(trash,item.id),manifest=path.join(trash,item.id+'.json');item.deletedAt=new Date(now-8*86400000).toISOString();await fs.writeFile(manifest,JSON.stringify(item));const preview=await store.previewTrash(7);let injected=false;fs.unlink=async target=>{await unlink(target);if(target===path.join(data,'a.md')){injected=true;await fs.writeFile(path.join(data,'new.md'),'preserve');}};
 const result=await store.purgeTrash(preview.token);expect(injected).toBe(true);expect(result.deletedIds).toEqual([]);expect(result.failed[0]).toMatchObject({id:item.id,partialDataDeleted:true});expect(await fs.readFile(path.join(data,'new.md'),'utf8')).toBe('preserve');expect(await fs.readFile(manifest,'utf8')).toContain(item.id);
 }finally{fs.unlink=unlink;const resolved=path.resolve(base),tmp=path.resolve(os.tmpdir());if(path.dirname(resolved)!==tmp||!path.basename(resolved).startsWith('hive-retention-'))throw Error('unsafe test cleanup');await fs.rm(resolved,{recursive:true,force:true});}
});

it('reports deleted data when metadata cleanup fails and retains the manifest for retry',async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'hive-retention-')),root=path.join(base,'docs'),state=path.join(base,'state');await fs.mkdir(root);await fs.mkdir(state);
 try{const now=Date.now(),files=fileStore(root),store=explorerStore({root,state,files},undefined,{now:()=>now});await fs.writeFile(path.join(root,'a.md'),'a');const item=await store.manage({action:'trash',path:'a.md'}),trash=path.join(root,'.hive-trash'),manifest=path.join(trash,item.id+'.json');item.deletedAt=new Date(now-8*86400000).toISOString();await fs.writeFile(manifest,JSON.stringify(item));await fs.writeFile(path.join(state,'file-times.json'),'broken');const result=await store.purgeTrash((await store.previewTrash(7)).token);expect(result.failed[0]).toMatchObject({id:item.id,dataDeleted:true});expect(result.failed[0].error).toContain('内容已永久删除');expect((await store.listTrash())[0].missing).toBe(true);expect(await fs.readFile(manifest,'utf8')).toContain(item.id);
 }finally{const resolved=path.resolve(base),tmp=path.resolve(os.tmpdir());if(path.dirname(resolved)!==tmp||!path.basename(resolved).startsWith('hive-retention-'))throw Error('unsafe test cleanup');await fs.rm(resolved,{recursive:true,force:true});}
});
