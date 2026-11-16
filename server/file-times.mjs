import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

// Identity changes on atomic replacement; retain creation time only when identity matches.
const identity = stat => ({dev:stat.dev,ino:stat.ino,birthtimeMs:stat.birthtimeMs});
const matches = (record,stat) => record && record.dev===stat.dev && record.ino===stat.ino && record.birthtimeMs===stat.birthtimeMs && Number.isFinite(record.createdAt);
export function fileTimes(state) {
  const target=path.join(state,'file-times.json');
  async function check() {
    try {const stat=await fs.lstat(target);if(stat.isSymbolicLink()||!stat.isFile())throw new Error('创建时间状态文件不可用。');}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  async function read() {
    await check();
    try {const data=JSON.parse(await fs.readFile(target,'utf8'));return Object.assign(Object.create(null),data && typeof data==='object' && !Array.isArray(data)?data:{});}
    catch(error){if(error.code==='ENOENT')return Object.create(null);throw error;}
  }
  async function write(data) {
    await check();
    const temp=target+'.'+randomUUID()+'.tmp';
    try {await fs.writeFile(temp,JSON.stringify(data,null,2),{flag:'wx'});await check();await fs.rename(temp,target);}
    finally {await fs.rm(temp,{force:true}).catch(()=>{});}
  }
  function observe(data,relative,stat) {
    const previous=Object.hasOwn(data,relative)?data[relative]:null;
    const createdAt=matches(previous,stat)?previous.createdAt:stat.birthtimeMs;
    const next={...identity(stat),createdAt};
    const dirty=!matches(previous,stat);
    data[relative]=next;
    return {createdAt,dirty};
  }
  function replaced(data,relative,stat,createdAt) {data[relative]={...identity(stat),createdAt};}
  return {read,write,observe,replaced};
}
