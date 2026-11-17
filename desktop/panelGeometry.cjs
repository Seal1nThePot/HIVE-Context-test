const {nativePanelBounds,panelContentRect}=require('./windowPolicy.cjs');
const keys=['x','y','width','height'];

/** Owns the content rectangle in screen DIPs, including the requested size.
 * Keep OS rounding from becoming a new request on every collapse/reopen.
 * Actual moves/resizes are applied as deltas from the last observed bounds. */
function createPanelGeometry({mainWindow}){
  const records=new WeakMap();
  function restore(child,placement){
    const main=mainWindow(),requested=nativePanelBounds(placement,main.getContentBounds(),main.webContents.getZoomFactor());
    if(!requested)return false;
    const [minWidth,minHeight]=child.getMinimumSize?.()||[220,140];
    requested.width=Math.max(requested.width,minWidth);requested.height=Math.max(requested.height,minHeight);
    child.setContentBounds(requested);
    records.set(child,{requested,observed:{...child.getContentBounds()}});
    return true;
  }
  function read(child){
    const main=mainWindow();if(!main||main.isDestroyed()||child.isDestroyed())return null;
    const observed=child.getContentBounds(),previous=records.get(child);
    const requested=previous?Object.fromEntries(keys.map(key=>[key,previous.requested[key]+observed[key]-previous.observed[key]])):{...observed};
    records.set(child,{requested,observed:{...observed}});
    return panelContentRect(requested,main.getContentBounds(),main.webContents.getZoomFactor());
  }
  return {restore,read};
}

function createPanelRectHandler({isMainSender,panelWindows,geometry}){
  return (event,id)=>{
    let rect=null;
    try{
      if(isMainSender(event)&&typeof id==='string'&&/^[A-Za-z0-9_:-]{1,128}$/.test(id)){
        const child=panelWindows.get(id);if(child&&!child.isDestroyed())rect=geometry.read(child);
      }
    }catch{/* A closing native host has no current geometry. */}
    event.returnValue=rect;
  };
}
module.exports={createPanelGeometry,createPanelRectHandler};
