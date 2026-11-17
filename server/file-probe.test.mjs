import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileStore} from './files.mjs';
import {fileProbe} from './file-probe.mjs';

let temporary,files,probe,time;
beforeEach(async()=>{
  temporary=await fs.mkdtemp(path.join(os.tmpdir(),'hive-probe-'));
  files=fileStore(temporary);time=0;
  probe=fileProbe(files,{now:()=>time});
});
afterEach(async()=>{
  vi.restoreAllMocks();files.close?.();
  if(path.dirname(temporary)!==path.resolve(os.tmpdir())||!path.basename(temporary).startsWith('hive-probe-'))throw new Error('Unsafe cleanup');
  await fs.rm(temporary,{recursive:true,force:true});
});
it('skips unchanged content reads, but periodically verifies the full hash',async()=>{
  await fs.writeFile(path.join(temporary,'a.md'),'draft');
  const first=await probe.read('a.md');
  for(let i=0;i<10;i++)expect(await probe.read('a.md',first.hash)).toEqual({path:'a.md',hash:first.hash,unchanged:true});
  expect(probe.debugStats()).toMatchObject({reads:1,hits:10,cached:1});
  time=30_000;await probe.read('a.md',first.hash);
  expect(probe.debugStats().reads).toBe(2);
});
it('detects equal-length external replacements and preserves save conflicts',async()=>{
  await fs.writeFile(path.join(temporary,'a.md'),'first');
  const initial=await probe.read('a.md');
  await fs.writeFile(path.join(temporary,'new.tmp'),'other');
  await fs.rename(path.join(temporary,'new.tmp'),path.join(temporary,'a.md'));
  expect((await probe.read('a.md',initial.hash)).text).toBe('other');
  await expect(files.save({path:'a.md',text:'mine',baseline:initial.hash})).rejects.toMatchObject({status:409});
});
it('does not certify changes made while a file was being read',async()=>{
  await fs.writeFile(path.join(temporary,'a.md'),'first');
  const original=files.read;
  files.read=async(...args)=>{const result=await original(...args);await fs.writeFile(path.join(temporary,'a.md'),'changed after read');return result;};
  const first=await probe.read('a.md');files.read=original;
  expect(probe.debugStats().cached).toBe(0);
  expect((await probe.read('a.md',first.hash)).text).toBe('changed after read');
});
it('bounds hash hints and releases closed files without retaining text',async()=>{
  const small=fileProbe(files,{maxEntries:2});
  for(const name of ['a.md','b.md','c.md']){await fs.writeFile(path.join(temporary,name),name);await small.read(name);}
  expect(small.debugStats().cached).toBe(2);
  small.retain(['c.md']);expect(small.debugStats().cached).toBe(1);
  small.clear();expect(small.debugStats().cached).toBe(0);
});
