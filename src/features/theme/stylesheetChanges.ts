/** CSSOM edits do not produce DOM mutation records. Share one reversible hook
 * between theme compilation and all native-window mirrors. */
const listeners=new Set<(sheet:CSSStyleSheet)=>void>();
let restore:(()=>void)|undefined;
export function subscribeStylesheetChanges(listener:(sheet:CSSStyleSheet)=>void){
  listeners.add(listener);
  if(!restore&&typeof CSSStyleSheet!=='undefined'){
    const prototype=CSSStyleSheet.prototype;
    const originalInsert=prototype.insertRule,originalDelete=prototype.deleteRule;
    const notify=(sheet:CSSStyleSheet)=>{for(const listener of listeners)try{listener(sheet);}catch{/* Observation must not change CSSOM behavior. */}};
    const insert:typeof originalInsert=function(this:CSSStyleSheet,rule,index){const result=originalInsert.call(this,rule,index);notify(this);return result;};
    const remove:typeof originalDelete=function(this:CSSStyleSheet,index){originalDelete.call(this,index);notify(this);};
    prototype.insertRule=insert;prototype.deleteRule=remove;
    restore=()=>{if(prototype.insertRule===insert)prototype.insertRule=originalInsert;if(prototype.deleteRule===remove)prototype.deleteRule=originalDelete;};
  }
  return()=>{listeners.delete(listener);if(!listeners.size&&restore){restore();restore=undefined;}};
}
