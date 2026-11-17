const path = require('node:path');
const validColor = value => typeof value === 'string' && /^(?:rgba?\(\s*\d{1,3}(?:\s*,\s*\d{1,3}){2}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)|#[0-9a-f]{6}(?:[0-9a-f]{2})?)$/i.test(value);
function tooltipData(value) {
  if (!value || value.id !== 'global-toolbar' || typeof value.text !== 'string' || !value.text.length || value.text.length > 160) return null;
  const a=value.anchor;
  if(!a || ![a.x,a.y,a.width,a.height,value.width,value.height,value.fontSize].every(n=>typeof n==='number'&&Number.isFinite(n)) || a.x<0 || a.y<0 || a.width<=0 || a.height<=0 || a.x+a.width>2000 || a.y+a.height>2000 || value.width<=0 || value.width>800 || value.height<=0 || value.height>100 || value.fontSize<6 || value.fontSize>48 || ![value.background,value.color,value.border].every(validColor))return null;
  return {text:value.text,anchor:{x:a.x,y:a.y,width:a.width,height:a.height},width:value.width,height:value.height,background:value.background,color:value.color,border:value.border,fontSize:value.fontSize};
}
function tooltipBounds(data, toolbar, zoom, area){
  const s=Number.isFinite(zoom)&&zoom>0?zoom:1, pad=8*s;
  const width=Math.min(area.width,Math.ceil(data.width*s+pad*2)),height=Math.min(area.height,Math.ceil(data.height*s+pad*2));
  const center=toolbar.x+(data.anchor.x+data.anchor.width/2)*s;
  let y=toolbar.y+data.anchor.y*s-12*s-height+pad;
  if(y<area.y)y=toolbar.y+(data.anchor.y+data.anchor.height)*s+12*s-pad;
  return {x:Math.round(Math.max(area.x,Math.min(center-width/2,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(y,area.y+area.height-height))),width,height};
}
function createTooltipManager({BrowserWindow,screen,root,getToolbar}){
  let tip=null,loaded=false,current=null;
  const hide=()=>{current=null;if(tip&&!tip.isDestroyed())tip.hide();};
  function render(){
    const owner=getToolbar();
    if(!current||!tip||tip.isDestroyed()||!owner||owner.isDestroyed()||!owner.isVisible()){hide();return;}
    const bounds=owner.getContentBounds(),zoom=owner.webContents.getZoomFactor();
    tip.setBounds(tooltipBounds(current,bounds,zoom,screen.getDisplayMatching(bounds).workArea));
    if(!loaded)return;
    tip.webContents.setZoomFactor(zoom);tip.webContents.send('hive:tooltip-data',current);tip.showInactive();
  }
  function show(value){
    if(value===null){hide();return;}
    const validated=tooltipData(value),owner=getToolbar();
    if(!validated||!owner||owner.isDestroyed()||!owner.isVisible()){hide();return;}
    const bounds=owner.getContentBounds(),scale=owner.webContents.getZoomFactor(),anchor=validated.anchor;
    if(!Number.isFinite(scale)||scale<=0||(anchor.x+anchor.width)*scale>bounds.width+1||(anchor.y+anchor.height)*scale>bounds.height+1){hide();return;}
    current=validated;
    if(!tip||tip.isDestroyed()){
      loaded=false;
      tip=new BrowserWindow({width:1,height:1,frame:false,transparent:true,focusable:false,alwaysOnTop:true,skipTaskbar:true,resizable:false,movable:false,minimizable:false,maximizable:false,show:false,webPreferences:{preload:path.join(root,'desktop','tooltip-overlay.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
      tip.setIgnoreMouseEvents(true);
      tip.webContents.on('will-navigate',event=>event.preventDefault());tip.webContents.on('will-redirect',event=>event.preventDefault());tip.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      tip.webContents.on('did-finish-load',()=>{loaded=true;render();});
      tip.on('closed',()=>{tip=null;loaded=false;current=null;});
      tip.loadFile(path.join(root,'desktop','tooltip-overlay.html')).catch(error=>{hide();console.error('Unable to load tooltip:',error);});
    }
    render();
  }
  return {show,hide};
}
module.exports={tooltipData,tooltipBounds,createTooltipManager};
