import { useCallback, useState } from 'react';
import type { ModelSelection } from '../settings/modelConfig';
export type ReasoningEffort='default'|'low'|'medium'|'high'|'xhigh';
export const reasoningLevels:{value:ReasoningEffort;label:string}[]=[{value:'default',label:'默认'},{value:'low',label:'低'},{value:'medium',label:'中'},{value:'high',label:'高'},{value:'xhigh',label:'极高'}];
const keyFor=(s:ModelSelection)=>`hive.reasoning.${JSON.stringify([s.serviceId,s.modelId])}`;
export function readReasoning(s:ModelSelection|null):ReasoningEffort {if(!s)return 'default';try{const v=localStorage.getItem(keyFor(s));return reasoningLevels.some(x=>x.value===v)?v as ReasoningEffort:'default';}catch{return 'default';}}
export function saveReasoning(s:ModelSelection|null,e:ReasoningEffort):void{if(s)localStorage.setItem(keyFor(s),e);}
export function useModelReasoning(selection:ModelSelection|null){
 const key=selection?keyFor(selection):'';
 const [state,setState]=useState(()=>({key,effort:readReasoning(selection),error:null as string|null}));
 const effort=state.key===key?state.effort:readReasoning(selection);
 const setEffort=useCallback((next:ReasoningEffort)=>{if(!selection)return;let error:string|null=null;try{saveReasoning(selection,next);}catch{error='推理强度未能保存';}setState({key,effort:next,error});},[key,selection?.serviceId,selection?.modelId]);
 return {effort,setEffort,saveError:state.key===key?state.error:null};
}
