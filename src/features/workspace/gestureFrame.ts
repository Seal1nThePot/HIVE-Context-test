type FrameClock={request:(callback:()=>void)=>number;cancel:(handle:number)=>void};

/** Keep pointer work bounded to one latest position per frame, with explicit terminal handling. */
export function latestGestureFrame<T>(clock:FrameClock,consume:(value:T)=>void){
  let frame:number|null=null,pending:T|undefined,queued=false;
  const flush=()=>{
    if(frame!==null){clock.cancel(frame);frame=null;}
    if(!queued)return;
    const value=pending as T;pending=undefined;queued=false;consume(value);
  };
  return {
    push(value:T){pending=value;queued=true;if(frame===null)frame=clock.request(()=>{frame=null;flush();});},
    flush,
    cancel(){if(frame!==null)clock.cancel(frame);frame=null;pending=undefined;queued=false;},
  };
}

export const gestureFrameClock=(window:Window):FrameClock=>({
  request:callback=>window.requestAnimationFrame(callback),
  cancel:handle=>window.cancelAnimationFrame(handle),
});
