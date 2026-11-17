export const editorSleepDelay=250;
type Clock={set:(callback:()=>void,delay:number)=>unknown;clear:(id:unknown)=>void};

/** Quick tab changes reuse the view. A protected composition/gesture waits for release. */
export function deferredEditorSleep(clock:Clock,sleep:()=>void,protectedInput:()=>boolean){
  let visible=true,timer:unknown=null,disposed=false;
  const cancel=()=>{if(timer!==null)clock.clear(timer);timer=null;};
  const schedule=()=>{if(disposed||visible||timer!==null)return;timer=clock.set(()=>{timer=null;if(!visible&&!protectedInput())sleep();},editorSleepDelay);};
  return {
    visible(value:boolean){visible=value;if(value)cancel();else schedule();},
    released(){schedule();},
    dispose(){disposed=true;cancel();},
  };
}
