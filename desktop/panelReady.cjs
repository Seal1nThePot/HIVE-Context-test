/** A synchronous IPC reply is sent by the setter, so assign returnValue once. */
function createPanelReadyHandler({isMainOrigin,panelWindows,mainWindow,nativePanelBounds,readyPanelIds,sizeTargets,onAccepted=()=>{},onRejected=()=>{}}){
  return (event,id,placement,inactive)=>{
    let accepted=false,reason='origin-rejected',error,child,addedReady=false;
    try{
      if(isMainOrigin(event)){
        if(typeof id!=='string')reason='host-id-invalid';
        else if(!panelWindows.has(id))reason='host-not-registered';
        else{
          child=panelWindows.get(id);reason=null;
          if(id!=='global-toolbar'&&placement!==undefined){
            const main=mainWindow(),bounds=nativePanelBounds(placement,main.getContentBounds(),main.webContents.getZoomFactor());
            if(!bounds)reason='bounds-invalid';
            else{child.setBounds(bounds);sizeTargets.set(child,{width:bounds.width,height:bounds.height});}
          }
          if(!reason){
            addedReady=!readyPanelIds.has(id);readyPanelIds.add(id);
            if(inactive===true)child.showInactive();else child.show();
            if(!sizeTargets.has(child)){const {width,height}=child.getBounds();sizeTargets.set(child,{width,height});}
            accepted=true;
          }
        }
      }
    }catch(cause){reason='initialization-exception';error=cause instanceof Error?cause.message:String(cause);if(addedReady)readyPanelIds.delete(id);}
    finally{
      // Logging must not prevent the one required reply or change its result.
      try{if(accepted)onAccepted(id,child);else onRejected({id:typeof id==='string'?id.slice(0,128):null,reason,error});}catch{/* Diagnostics are best effort. */}
      event.returnValue=accepted;
    }
  };
}
module.exports={createPanelReadyHandler};
