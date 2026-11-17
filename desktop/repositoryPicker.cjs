const path=require('node:path');

function createRepositoryPicker({isMainOrigin,getParent,showOpenDialog}) {
  let pending=null;
  return async event=>{
    if(!isMainOrigin(event))throw new Error('无法从此窗口选择仓库。');
    if(pending)return pending;
    const parent=getParent();if(!parent||parent.isDestroyed())return null;
    pending=(async()=>{
      const result=await showOpenDialog(parent,{title:'选择仓库文件夹',buttonLabel:'添加仓库',properties:['openDirectory']});
      const selected=result.filePaths?.[0];
      return !result.canceled&&typeof selected==='string'&&path.isAbsolute(selected)&&!selected.includes('\0')?selected:null;
    })();
    try{return await pending;}finally{pending=null;}
  };
}
module.exports={createRepositoryPicker};
