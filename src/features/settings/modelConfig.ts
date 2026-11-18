export const MODEL_CONFIGURATION_LIMIT=100;
export const MODEL_CONTEXT_TOKEN_MAX=Number.MAX_SAFE_INTEGER;
export const reasoningLevelValues=['off','minimal','low','medium','high','xhigh','max'] as const;
export type ReasoningLevel=typeof reasoningLevelValues[number];
export type ReasoningParameter={parameter:'reasoning_effort'|'reasoning.effort'|'thinking.type';value:string};
export const inputTypeValues=['text','image'] as const;
export type InputType=typeof inputTypeValues[number];
export type ModelCapabilities={reasoning?:Partial<Record<ReasoningLevel,ReasoningParameter>>;contextTokens?:number;maxOutputTokens?:number;input?:InputType[]};
export type ModelEntry={
  id:string;
  name:string;
  capabilities?:ModelCapabilities;
  reasoningLevels?:ReasoningLevel[];
  manualReasoningLevels?:ReasoningLevel[];
  defaultReasoning?:ReasoningLevel;
  contextTokens?:number;
  maxOutputTokens?:number;
  inputTypes?:InputType[];
};
export type ModelService={id:string;name:string;endpoint:string;enabled:boolean;models:ModelEntry[];hasKey:boolean};
export type ModelSelection={serviceId:string;modelId:string};
export type Config={schemaVersion:2;revision:number;demo:boolean;continuationLimit:number;services:ModelService[];selection:ModelSelection|null;endpoint:string;model:string;hasKey:boolean};
export type ModelProbeRequest={revision:number;service:{id?:string;endpoint:string};key?:string;clearKey?:boolean;modelId?:string};
export type ModelProbeResult={kind:'catalog';models:ModelEntry[];configurationLimit:number;hasMore?:boolean}|{kind:'generation';modelId:string;elapsedMs:number};

export function modelConnectionAddress(value:string):string|null{
  const input=value.trim();
  try{
    const url=new URL(input);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||/[?#\r\n\0]/.test(input))return null;
    const endpoint=(url.origin+url.pathname).replace(/\/+$/,'');
    return endpoint.replace(/\/chat\/completions$/,'')+'/chat/completions';
  }catch{return null;}
}

export const defaultImportedReasoningLevels:ReasoningLevel[]=['low','medium','high','max'];
/** Imported models stay adjustable even when the upstream declares no reasoning parameter. */
export function withImportedReasoningDefaults(model:ModelEntry):ModelEntry{
  if(model.manualReasoningLevels!==undefined)return model;
  const declared=model.capabilities?.reasoning;
  if(declared&&Object.keys(declared).length)return model;
  return {...model,manualReasoningLevels:[...defaultImportedReasoningLevels]};
}
export function effectiveInputTypes(model?:ModelEntry|null):InputType[]{
  const declared=model?.inputTypes??model?.capabilities?.input;
  const types=inputTypeValues.filter(type=>declared?.includes(type));
  return types.length?types:['text'];
}
export function effectiveReasoningLevels(model?:ModelEntry|null):ReasoningLevel[]{
  return reasoningLevelValues.filter(level=>model?.manualReasoningLevels?.includes(level)||
    (model?.capabilities?.reasoning?.[level]&&
      (model.reasoningLevels===undefined||model.reasoningLevels.includes(level))));
}

export function selectedModelEntry(config:Config):ModelEntry|undefined{
  const selection=config.selection;
  return config.services.find(service=>service.id===selection?.serviceId)?.models.find(model=>model.id===selection?.modelId);
}
export const initialConfig:Config={schemaVersion:2,revision:0,demo:true,continuationLimit:100,services:[],selection:null,endpoint:'',model:'',hasKey:false};
export function normalizeConfig(value:Config):Config{
  if(Array.isArray(value.services))return value;
  const services=value.endpoint?[{id:'legacy',name:'默认服务',endpoint:value.endpoint,enabled:true,hasKey:value.hasKey,models:value.model?[{id:value.model,name:value.model}]:[]}]:[];
  return {...initialConfig,...value,services,selection:services[0]?.models[0]?{serviceId:'legacy',modelId:services[0].models[0].id}:null};
}
export const modelChoice=(selection:ModelSelection)=>JSON.stringify([selection.serviceId,selection.modelId]);
export function parseModelChoice(value:string):ModelSelection{
  const pair:unknown=JSON.parse(value);
  if(!Array.isArray(pair)||pair.length!==2||pair.some(item=>typeof item!=='string'))throw new Error('模型选择无效，请重新选择。');
  return {serviceId:pair[0],modelId:pair[1]};
}
export function modelOptions(config:Config){
  return config.services.filter(service=>service.enabled).flatMap(service=>service.models.map(model=>({value:modelChoice({serviceId:service.id,modelId:model.id}),label:`${service.name} · ${model.name}`,serviceId:service.id,modelId:model.id})));
}
export function activeModelLabel(config:Config){
  if(config.demo)return '演示模式';
  const service=config.services.find(item=>item.id===config.selection?.serviceId),model=service?.models.find(item=>item.id===config.selection?.modelId);
  return model?`${service!.name} · ${model.name}`:config.model||'选择模型';
}
