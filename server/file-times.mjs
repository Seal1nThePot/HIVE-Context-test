import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

// Identity changes on atomic replacement; retain creation time only when identity matches.
const identity = stat => ({dev:stat.dev,ino:stat.ino,birthtimeMs:stat.birthtimeMs});
const matches = (record,stat) => record && record.dev===stat.dev && record.ino===stat.ino && record.birthtimeMs===stat.birthtimeMs && Number.isFinite(record.createdAt);
const signature = stat => stat ? [stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs].join(':') : 'missing';
const CACHE_BYTES = 16 * 1024 * 1024;
export function fileTimes(state) {
  const target=path.join(state,'file-times.json');
  let cached, cachedSignature;
  const clear=()=>{cached=undefined;cachedSignature=undefined;};
  async function check() {
    try {const stat=await fs.lstat(target);if(stat.isSymbolicLink()||!stat.isFile())throw new Error('创建时间状态文件不可用。');return stat;}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  async function read() {
    const before=await check(), stamp=signature(before);
    if(cached && cachedSignature===stamp)return cached;
    clear();
    if(!before)return Object.create(null);
    const parsed=JSON.parse(await fs.readFile(target,'utf8'));
    const data=parsed && typeof parsed==='object' && !Array.isArray(parsed) ? Object.setPrototypeOf(parsed,null) : Object.create(null);
    const after=await check();
    // Metadata moves and rollback still write this file directly. Never reuse a
    // cached generation after an external replacement, including a failed read.
    if(signature(after)!==stamp)throw new Error('创建时间状态文件在读取期间变化，请重试。');
    if(after.size<=CACHE_BYTES){cached=data;cachedSignature=stamp;}
    return data;
  }
  async function write(data) {
    await check();
    const temp=target+'.'+randomUUID()+'.tmp';
    try {
      const text=JSON.stringify(data);
      await fs.writeFile(temp,text,{flag:'wx'});await check();await fs.rename(temp,target);
      const stat=await check();clear();
      if(stat.size<=CACHE_BYTES){cached=data;cachedSignature=signature(stat);}
    } catch(error){clear();throw error;}
    finally {await fs.rm(temp,{force:true}).catch(()=>{});}
  }
  function observe(data,relative,stat) {
    const previous=Object.hasOwn(data,relative)?data[relative]:null;
    if(matches(previous,stat))return {createdAt:previous.createdAt,dirty:false};
    const createdAt=stat.birthtimeMs;
    data[relative]={...identity(stat),createdAt};
    return {createdAt,dirty:true};
  }
  function replaced(data,relative,stat,createdAt) {data[relative]={...identity(stat),createdAt};}
  return {read,write,observe,replaced,clear};
}
