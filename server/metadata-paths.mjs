import {promises as fs} from 'node:fs';
import {randomUUID} from 'node:crypto';

export const mapPath = (value, from, to) => value === from || value.startsWith(from + '/') ? to + value.slice(from.length) : value;
// Called under the workspace request queue, so structural edits cannot race metadata saves.
export async function remapMetadata(state, from, to) {
  const changed=[];
  try {
    for(const filename of ['text-annotations.json','writing-outline-nodes.json','writing-outlines.json','file-times.json']) {
      const target=state + '/' + filename;
      if(filename==='file-times.json'){try{const stat=await fs.lstat(target);if(stat.isSymbolicLink()||!stat.isFile())throw new Error('创建时间状态文件不可用。');}catch(error){if(error.code!=='ENOENT')throw error;}}
      let original;try {original=await fs.readFile(target,'utf8');}catch(error){if(error.code==='ENOENT')continue;throw error;}
      const all=JSON.parse(original),next=Object.create(null);let dirty=false;
      const entries=Object.entries(all).sort(([a],[b])=>Number(mapPath(a,from,to)!==a)-Number(mapPath(b,from,to)!==b));
      for(const [key,value] of entries) {
        const annotation=filename==='text-annotations.json';
        const file=annotation?(key.startsWith('document:')?key.slice(9):null):key;
        const mapped=file===null?null:mapPath(file,from,to);
        const destination=mapped===null?key:annotation?'document:'+mapped:mapped;
        if(filename!=='file-times.json'&&destination!==key&&Object.hasOwn(all,destination))throw new Error('目标路径已有标注或大纲记录，请换一个名称。');
        dirty ||= destination!==key;
        next[destination]=annotation&&destination!==key?{...value,items:value.items.map(item=>({...item,file:mapped}))}:value;
      }
      if(!dirty)continue;
      const temp=target+'.'+randomUUID()+'.tmp';
      try {await fs.writeFile(temp,JSON.stringify(next,null,2),{flag:'wx'});await fs.rename(temp,target);}
      finally {await fs.rm(temp,{force:true}).catch(()=>{});}
      changed.push({target,original});
    }
  }catch(error) {
    for(const {target,original} of changed.reverse())await fs.writeFile(target,original);
    throw error;
  }
}

// Idempotent cleanup: a retained manifest lets a later attempt finish after a partial failure.
export async function removeMetadata(state, prefix) {
  for (const filename of ['text-annotations.json','writing-outline-nodes.json','writing-outlines.json','file-times.json']) {
    const target=state+'/'+filename;
    let original;
    try {const stat=await fs.lstat(target);if(stat.isSymbolicLink()||!stat.isFile())throw new Error('元数据文件不可用。');original=await fs.readFile(target,'utf8');}
    catch(error){if(error.code==='ENOENT')continue;throw error;}
    const all=JSON.parse(original), next=Object.create(null);let dirty=false;
    for(const [key,value] of Object.entries(all)) {
      const file=filename==='text-annotations.json'?(key.startsWith('document:')?key.slice(9):null):key;
      if(file!==null&&(file===prefix||file.startsWith(prefix+'/'))){dirty=true;continue;}
      next[key]=value;
    }
    if(!dirty)continue;
    const temp=target+'.'+randomUUID()+'.tmp';
    try {await fs.writeFile(temp,JSON.stringify(next,null,2),{flag:'wx'});await fs.rename(temp,target);}
    finally {await fs.rm(temp,{force:true}).catch(()=>{});}
  }
}
