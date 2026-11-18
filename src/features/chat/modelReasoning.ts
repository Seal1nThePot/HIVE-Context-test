import { useEffect, useState } from 'react';
import { effectiveReasoningLevels, type ModelEntry, type ModelSelection, type ReasoningLevel } from '../settings/modelConfig';

export type ReasoningEffort='default'|ReasoningLevel;
export const reasoningLevels:{value:ReasoningEffort;label:string}[]=[
  {value:'default',label:'默认'},
  {value:'off',label:'关闭'},
  {value:'minimal',label:'最小'},
  {value:'low',label:'低'},
  {value:'medium',label:'中'},
  {value:'high',label:'高'},
  {value:'xhigh',label:'极高'},
  {value:'max',label:'最大'},
];

const keyFor=(selection:ModelSelection)=>`hive.reasoning.${JSON.stringify([selection.serviceId,selection.modelId])}`;
const unavailable='原推理档位已不可用，已切回服务默认。';

function storedReasoning(key:string):ReasoningEffort|undefined {
  if(!key)return undefined;
  try{
    const saved=localStorage.getItem(key);
    return reasoningLevels.find(level=>level.value===saved)?.value;
  }catch{return undefined;}
}

export function readReasoning(selection:ModelSelection|null):ReasoningEffort {
  return storedReasoning(selection?keyFor(selection):'')??'default';
}

export function saveReasoning(selection:ModelSelection|null, effort:ReasoningEffort):void {
  if(selection)localStorage.setItem(keyFor(selection),effort);
}

export function resolveModelReasoning(model:ModelEntry|undefined, stored:ReasoningEffort|undefined){
  const selected=stored??model?.defaultReasoning??'default';
  const dropped=selected!=='default'&&!effectiveReasoningLevels(model).includes(selected);
  return {effort:dropped?'default' as const:selected,dropped};
}

export function useModelReasoning(selection:ModelSelection|null, model:ModelEntry|undefined){
  const key=selection?keyFor(selection):'';
  const [state,setState]=useState<{key:string;chosen:ReasoningEffort;saveError:string|null}|null>(null);
  const active=state?.key===key?state:null;
  const {effort,dropped}=resolveModelReasoning(model,active?.chosen??storedReasoning(key));
  const [last,setLast]=useState({key,effort,withdrawn:false});
  const lostConfiguredLevel=last.key===key&&last.effort!=='default'&&!effectiveReasoningLevels(model).includes(last.effort);
  const withdrawn=dropped||lostConfiguredLevel||(last.key===key&&last.withdrawn);
  useEffect(()=>{
    if(last.key!==key||last.effort!==effort||last.withdrawn!==withdrawn)setLast({key,effort,withdrawn});
  },[key,effort,withdrawn,last]);
  function setEffort(next:ReasoningEffort){
    if(!selection||next!=='default'&&!effectiveReasoningLevels(model).includes(next))return;
    let saveError:string|null=null;
    try{saveReasoning(selection,next);}catch{saveError='推理强度未能保存。';}
    setState({key,chosen:next,saveError});
    setLast({key,effort:next,withdrawn:false});
  }
  return {effort,setEffort,saveError:active?.saveError??(withdrawn?unavailable:null)};
}
