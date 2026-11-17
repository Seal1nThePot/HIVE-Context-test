import {promises as fs} from 'node:fs';

const stamp = stat => [stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs].join(':');

/** Hash hints for sync only. Saves always perform their own full disk checks. */
export function fileProbe(files,{now=Date.now,verifyAfter=30_000,maxEntries=100}={}) {
  const records=new Map();
  const stats={checks:0,reads:0,hits:0};
  async function read(relative,knownHash) {
    const target=await files.resolve(relative),before=await fs.stat(target);
    stats.checks++;
    const signature=stamp(before),previous=records.get(relative);
    if(previous && typeof knownHash==='string' && knownHash===previous.hash &&
        signature===previous.signature && now()-previous.checkedAt<verifyAfter){
      stats.hits++;
      return {path:relative,hash:knownHash,unchanged:true};
    }
    stats.reads++;
    const result=await files.read(relative,knownHash),after=await fs.stat(target);
    if(stamp(after)===signature){
      records.delete(relative);
      records.set(relative,{signature,hash:result.hash,checkedAt:now()});
      while(records.size>maxEntries)records.delete(records.keys().next().value);
    }else records.delete(relative);
    return result;
  }
  function retain(paths){const live=new Set(paths);for(const key of records.keys())if(!live.has(key))records.delete(key);}
  return {read,retain,clear:()=>records.clear(),debugStats:()=>({...stats,cached:records.size})};
}
