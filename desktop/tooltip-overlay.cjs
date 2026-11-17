const {ipcRenderer}=require('electron');
ipcRenderer.on('hive:tooltip-data',(_event,data)=>{
  const node=document.getElementById('tip');if(!node)return;
  node.textContent=data.text;
  node.style.backgroundColor=data.background;node.style.color=data.color;node.style.borderColor=data.border;node.style.fontSize=`${data.fontSize}px`;
});
