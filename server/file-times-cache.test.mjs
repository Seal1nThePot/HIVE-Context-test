import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileTimes} from './file-times.mjs';

let temporary,target,times;
beforeEach(async()=>{
  temporary=await fs.mkdtemp(path.join(os.tmpdir(),'hive-times-cache-'));
  target=path.join(temporary,'file-times.json');times=fileTimes(temporary);
  await fs.writeFile(target,JSON.stringify({note:{createdAt:1}}));
});
afterEach(async()=>{
  vi.restoreAllMocks();
  if(path.dirname(temporary)!==path.resolve(os.tmpdir())||!path.basename(temporary).startsWith('hive-times-cache-'))throw new Error('Unsafe cleanup');
  await fs.rm(temporary,{recursive:true,force:true});
});
it('parses an unchanged state file once and releases its cache explicitly',async()=>{
  const reads=vi.spyOn(fs,'readFile'),first=await times.read();
  for(let i=0;i<12;i++)expect(await times.read()).toBe(first);
  expect(reads).toHaveBeenCalledTimes(1);
  times.clear();expect(await times.read()).not.toBe(first);expect(reads).toHaveBeenCalledTimes(2);
});
it('reloads direct metadata moves and rollback replacements',async()=>{
  await times.read();
  const other=path.join(temporary,'move.tmp');
  await fs.writeFile(other,JSON.stringify({renamed:{createdAt:1}}));await fs.rename(other,target);
  expect(await times.read()).toEqual({renamed:{createdAt:1}});
  await fs.writeFile(other,JSON.stringify({note:{createdAt:1}}));await fs.rename(other,target);
  expect(await times.read()).toEqual({note:{createdAt:1}});
});
it('does not reuse unsaved mutations after a failed atomic replacement',async()=>{
  const data=await times.read();data.unsaved={createdAt:2};
  const rename=vi.spyOn(fs,'rename').mockRejectedValueOnce(Object.assign(new Error('denied'),{code:'EACCES'}));
  await expect(times.write(data)).rejects.toHaveProperty('code','EACCES');rename.mockRestore();
  expect(await times.read()).toEqual({note:{createdAt:1}});
});
it('retains null-prototype path semantics without copying the parsed map',async()=>{
  await fs.writeFile(target,'{"__proto__":{"createdAt":7}}');
  const data=await times.read();expect(Object.getPrototypeOf(data)).toBe(null);
  expect(Object.hasOwn(data,'__proto__')).toBe(true);
  await times.write(data);expect(JSON.parse(await fs.readFile(target,'utf8')).__proto__.createdAt).toBe(7);
});
