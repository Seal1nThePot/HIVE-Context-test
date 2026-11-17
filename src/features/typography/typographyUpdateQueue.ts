/** Coalesce slider updates and retain only the latest value during native IME composition. */
export function typographyUpdateQueue<T>(options:{composing:()=>boolean;schedule:(callback:()=>void)=>unknown;cancel:(id:unknown)=>void;apply:(value:T)=>void}){
  let pending:T|undefined,hasPending=false,scheduled:unknown=null,disposed=false;
  const flush=()=>{
    scheduled=null;
    if(disposed||!hasPending||options.composing())return;
    const value=pending!;hasPending=false;options.apply(value);
  };
  const released=()=>{if(!disposed&&hasPending&&scheduled===null&&!options.composing())scheduled=options.schedule(flush);};
  return {request(value:T){if(disposed)return;pending=value;hasPending=true;released();},released,dispose(){disposed=true;hasPending=false;if(scheduled!==null)options.cancel(scheduled);scheduled=null;}};
}
