import {renderMath} from './mathRender';
const scope=self as unknown as {onmessage:((event:MessageEvent<{id:number;source:string;displayMode:boolean}>)=>void)|null;postMessage:(value:unknown)=>void};
scope.onmessage=event=>{
  const {id,source,displayMode}=event.data;
  scope.postMessage({id,...renderMath(source,displayMode)});
};
