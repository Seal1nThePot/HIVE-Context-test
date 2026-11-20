/** A synchronous IPC reply is sent by the setter, so assign returnValue once. */
function createPanelReadyHandler({isMainOrigin,panelWindows,geometry,readyPanelIds,sizeTargets,canPresent=()=>true,onAccepted=()=>{},onRejected=()=>{}}){
  return (event,id,placement,inactive)=>{
    let accepted=false,reason='origin-rejected',error,child,addedReady=false;
    try{
      if(isMainOrigin(event)){
        if(typeof id!=='string')reason='host-id-invalid';
        else if(!panelWindows.has(id))reason='host-not-registered';
        else{
          child=panelWindows.get(id);reason=null;
          if(id!=='global-toolbar'&&placement!==undefined){
            if(!geometry.restore(child,placement))reason='bounds-invalid';
            else{const {width,height}=child.getBounds();sizeTargets.set(child,{width,height});}
          }
          if(!reason){
            addedReady=!readyPanelIds.has(id);readyPanelIds.add(id);
            if(canPresent(id)){
              if(inactive===true)child.showInactive();else child.show();
            }
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
