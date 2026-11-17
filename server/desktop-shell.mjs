import {randomUUID} from 'node:crypto';

/** The backend resolves workspace paths before asking its own desktop parent to reveal them. */
export function desktopShell(channel,{timeoutMs=5000}={}){
  const pending=new Map();
  const fail=()=>Object.assign(new Error('无法打开系统资源管理器，请重试。'),{status:503});
  function finish(id,error){const request=pending.get(id);if(!request)return;pending.delete(id);clearTimeout(request.timer);if(error)request.reject(error);else request.resolve();}
  const message=value=>{if(value?.type==='hive-reveal-result')finish(value.id,value.ok===true?null:fail());};
  const disconnect=()=>{for(const id of pending.keys())finish(id,fail());};
  channel.on('message',message);channel.on('disconnect',disconnect);
  return {
    revealFile(target){return new Promise((resolve,reject)=>{
      if(!channel.connected||typeof channel.send!=='function'){reject(fail());return;}
      const id=randomUUID(),timer=setTimeout(()=>finish(id,fail()),timeoutMs);
      pending.set(id,{resolve,reject,timer});
      try{channel.send({type:'hive-reveal-file',id,path:target},error=>{if(error)finish(id,fail());});}catch{finish(id,fail());}
    });},
    dispose(){disconnect();channel.removeListener('message',message);channel.removeListener('disconnect',disconnect);},
  };
}
