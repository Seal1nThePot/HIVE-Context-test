export type ModelEntry={id:string;name:string};
export type ModelService={id:string;name:string;endpoint:string;enabled:boolean;models:ModelEntry[];hasKey:boolean};
export type ModelSelection={serviceId:string;modelId:string};
export type Config={schemaVersion:2;revision:number;demo:boolean;continuationLimit:number;services:ModelService[];selection:ModelSelection|null;endpoint:string;model:string;hasKey:boolean};
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
