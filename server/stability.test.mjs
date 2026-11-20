import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileStore} from './files.mjs';
import {importStore} from './imports.mjs';
import {workspaceStore} from './workspace.mjs';
import {annotationStore} from './annotations.mjs';

let temporary,root,files;
const ioError=code=>Object.assign(new Error('injected '+code),{code});
beforeEach(async()=>{temporary=await fs.mkdtemp(path.join(os.tmpdir(),'hive-stability-'));root=path.join(temporary,'docs');await fs.mkdir(root);files=fileStore(root);});
afterEach(async()=>{
  vi.restoreAllMocks();
  if(path.dirname(temporary)!==path.resolve(os.tmpdir())||!path.basename(temporary).startsWith('hive-stability-'))throw new Error('Unsafe test cleanup target');
  await fs.rm(temporary,{recursive:true,force:true});
});

describe('injected filesystem failures',()=>{
  it.each(['ENOSPC','EACCES','EIO'])('keeps original bytes and unlocks later saves after a partial temporary write: %s',async code=>{
    const original=Buffer.from('\ufeff原稿\r\n'),target=path.join(root,'draft.md');await fs.writeFile(target,original);const baseline=await files.read('draft.md');
    const write=fs.writeFile.bind(fs),fault=vi.spyOn(fs,'writeFile').mockImplementation(async(file,data,options)=>{
      if(String(file).endsWith('.tmp')){await write(file,String(data).slice(0,2),options);throw ioError(code);}return write(file,data,options);
    });
    await expect(files.save({path:'draft.md',text:'replacement',baseline:baseline.hash})).rejects.toMatchObject({code});
    expect(await fs.readFile(target)).toEqual(original);expect(await fs.readdir(root)).toEqual(['draft.md']);fault.mockRestore();
    await files.save({path:'draft.md',text:'recovered',baseline:baseline.hash});expect((await files.read('draft.md')).text).toBe('recovered');
  });
  it('recovers the write queue after replacement is rejected',async()=>{
    const baseline=await files.save({path:'draft.md',text:'original',baseline:null}),rename=fs.rename.bind(fs);
    const fault=vi.spyOn(fs,'rename').mockRejectedValueOnce(ioError('EACCES'));
    await expect(files.save({path:'draft.md',text:'first',baseline:baseline.hash})).rejects.toMatchObject({code:'EACCES'});fault.mockImplementation(rename);
    await files.save({path:'draft.md',text:'second',baseline:baseline.hash});expect((await files.read('draft.md')).text).toBe('second');expect(await fs.readdir(root)).toEqual(['draft.md']);
  });
  it('detects a disk edit injected between preparation and replacement',async()=>{
    const baseline=await files.save({path:'draft.md',text:'original',baseline:null}),write=fs.writeFile.bind(fs);
    vi.spyOn(fs,'writeFile').mockImplementation(async(file,data,options)=>{await write(file,data,options);if(String(file).endsWith('.tmp'))await write(path.join(root,'draft.md'),'external');});
    await expect(files.save({path:'draft.md',text:'mine',baseline:baseline.hash})).rejects.toMatchObject({status:409});
    expect((await files.read('draft.md')).text).toBe('external');expect(await fs.readdir(root)).toEqual(['draft.md']);
  });
  it('returns the written baseline if file metadata fails after publication and can save again', async () => {
    const store = fileStore(root, temporary);
    const initial = await store.save({ path: 'draft.md', text: 'original', baseline: null });
    const rename = fs.rename.bind(fs);
    const fault = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (path.basename(to) === 'file-times.json') throw ioError('EACCES');
      return rename(from, to);
    });

    const published = await store.save({ path: 'draft.md', text: 'published', baseline: initial.hash });
    expect(published.warning).toContain('正文已保存');
    expect(await store.read('draft.md')).toMatchObject({ hash: published.hash, text: 'published' });
    expect(await fs.readdir(root)).toEqual(['draft.md']);

    fault.mockRestore();
    const next = await store.save({ path: 'draft.md', text: 'retry', baseline: published.hash });
    expect(next.warning).toBeUndefined();
    expect(await store.read('draft.md')).toMatchObject({ hash: next.hash, text: 'retry' });
  });
  it.each(['ENOSPC','EIO','EACCES'])('leaves no partial imported file after a failed write: %s',async code=>{
    await fs.writeFile(path.join(root,'draft.md'),'existing');const imports=importStore({root,files}),write=fs.writeFile.bind(fs);
    vi.spyOn(fs,'writeFile').mockImplementation(async(file,data,options)=>{
      if(String(file).includes('draft-2.md')||path.basename(String(file)).startsWith('.hive-import-')){await write(file,Buffer.from(data).subarray(0,3),options);throw ioError(code);}return write(file,data,options);
    });
    await expect(imports.store('draft.md',Buffer.from('complete imported content'))).rejects.toMatchObject({code});
    expect(await fs.readdir(root)).toEqual(['draft.md']);expect(await fs.readFile(path.join(root,'draft.md'),'utf8')).toBe('existing');
  });
  it('keeps the previous workspace and revision when persisting a switch fails',async()=>{
    const state=path.join(temporary,'state'),other=path.join(temporary,'other');await fs.mkdir(other);const spaces=await workspaceStore(state,root),before=spaces.read();
    const fault=vi.spyOn(fs,'rename').mockRejectedValueOnce(ioError('ENOSPC'));
    await expect(spaces.update({root:other,revision:before.revision})).rejects.toMatchObject({code:'ENOSPC'});expect(spaces.read()).toEqual(before);fault.mockRestore();
    await spaces.update({root:other,revision:before.revision});expect(spaces.read().root).toBe(await fs.realpath(other));expect((await fs.readdir(state)).some(name=>name.endsWith('.tmp'))).toBe(false);
  });
  it('cleans unpublished import data when publication fails and allows a later retry',async()=>{
    const imports=importStore({root,files}),fault=vi.spyOn(fs,'link').mockRejectedValueOnce(ioError('EACCES'));
    await expect(imports.store('draft.md',Buffer.from('complete'))).rejects.toMatchObject({code:'EACCES'});expect(await fs.readdir(root)).toEqual([]);fault.mockRestore();
    expect(await imports.store('draft.md',Buffer.from('complete'))).toMatchObject({path:'draft.md'});expect(await fs.readFile(path.join(root,'draft.md'),'utf8')).toBe('complete');
  });
  it('retains a corrupted workspace record and every document on startup failure',async()=>{
    const state=path.join(temporary,'state'),file=path.join(state,'workspace.json'),draft=path.join(root,'draft.md');
    await fs.mkdir(state);
    await fs.writeFile(file,'{truncated');
    await fs.writeFile(draft,'keep me');
    await expect(workspaceStore(state,root)).rejects.toMatchObject({
      code:'HIVE_STATE_CORRUPT',message:expect.stringContaining(file),
    });
    expect(await fs.readFile(file,'utf8')).toBe('{truncated');
    expect(await fs.readFile(draft,'utf8')).toBe('keep me');
    await fs.writeFile(file,JSON.stringify({root,revision:7}));
    const restored=await workspaceStore(state,root);
    expect(restored.read()).toMatchObject({revision:7});
    restored.capture().files.suspend();
  });
  it('explains a corrupted annotation store and refuses to overwrite it',async()=>{
    const file=path.join(temporary,'text-annotations.json'),store=annotationStore(temporary);
    const source='document',draft='draft.md',fingerprint='a'.repeat(64);
    const item={source,file:draft,id:'id',from:0,to:1,original:'a',note:'keep this note',stale:false,createdAt:'now'};
    await store.save({source,file:draft,revision:0,fingerprint,items:[item]});
    const backup=await fs.readFile(file,'utf8');
    const damaged=backup.slice(0,Math.floor(backup.length/3));
    await fs.writeFile(file,damaged);
    const error={code:'HIVE_STATE_CORRUPT',status:500,message:expect.stringContaining(file)};
    await expect(store.read(source,draft)).rejects.toMatchObject(error);
    await expect(store.save({source,file:draft,revision:1,fingerprint,items:[]})).rejects.toMatchObject(error);
    expect(await fs.readFile(file,'utf8')).toBe(damaged);
    await fs.writeFile(file,backup);
    expect(await store.read(source,draft)).toMatchObject({revision:1,items:[item]});
  });
});
