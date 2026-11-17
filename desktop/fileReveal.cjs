const path=require('node:path');
const {promises:fs}=require('node:fs');

// This handler is attached only to the application's own backend IPC channel.
function createFileRevealHandler({shell,stat=target=>fs.lstat(target)}){
  return async message=>{
    const reply={type:'hive-reveal-result',id:message?.id,ok:false};
    try{
      const target=message?.path;
      if(message?.type!=='hive-reveal-file'||typeof message.id!=='string'||!/^[-a-f0-9]{36}$/.test(message.id)||typeof target!=='string'||target.includes('\0')||target.length>32767||!path.isAbsolute(target))return reply;
      const item=await stat(target);
      if(item.isSymbolicLink()||!item.isFile()&&!item.isDirectory())return reply;
      shell.showItemInFolder(target);reply.ok=true;
    }catch{}
    return reply;
  };
}
module.exports={createFileRevealHandler};
