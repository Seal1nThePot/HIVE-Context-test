import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function text(value,label,max=200){
  if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\r\n\0]/.test(value))fail(`${label}格式无效。`);
  return value.trim();
}
function endpoint(value){
  const input=text(value,'接口地址',4096);
  let url;try{url=new URL(input);}catch{fail('请填写有效的 HTTP(S) 接口地址。');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)
    fail('接口地址不能包含凭据、查询参数或片段。');
  return input.replace(/\/+$/,'');
}
function service(value,id){
  if(!value||typeof value!=='object'||typeof value.enabled!=='boolean'||!Array.isArray(value.models)||value.models.length>100)fail('服务配置格式无效。');
  const models=value.models.map(item=>({id:text(item?.id,'模型 ID'),name:text(item?.name||item?.id,'模型名称')}));
  if(new Set(models.map(item=>item.id)).size!==models.length)fail('同一个服务中不能重复添加相同模型 ID。');
  return {id,name:text(value.name,'服务名称',120),endpoint:endpoint(value.endpoint),enabled:value.enabled,models};
}
function selectedService(config){return config.services.find(item=>item.id===config.selection?.serviceId);}
function selectedModel(config){return selectedService(config)?.models.find(item=>item.id===config.selection?.modelId);}
function reconcile(config){
  if(!selectedModel(config)){config.selection=null;config.demo=true;}
  else if(!selectedService(config).enabled)config.demo=true;
  return config;
}
function migrate(value){
  const continuationLimit=Number.isInteger(value?.continuationLimit)&&value.continuationLimit>=1&&value.continuationLimit<=10000?value.continuationLimit:100;
  if(value?.schemaVersion===2){
    if(!Array.isArray(value.services)||value.services.length>40)fail('保存的模型服务配置格式无效。');
    const services=value.services.map(item=>service(item,text(item.id,'服务标识',80)));
    if(new Set(services.map(item=>item.id)).size!==services.length)fail('保存的服务标识重复。');
    return reconcile({schemaVersion:2,revision:Number.isInteger(value.revision)?value.revision:0,demo:value.demo!==false,continuationLimit,services,selection:value.selection||null});
  }
  const services=value?.endpoint?.trim()?[service({name:'默认服务',endpoint:value.endpoint,enabled:true,models:value.model?.trim()?[{id:value.model,name:value.model}]:[]},'legacy')]:[];
  return reconcile({schemaVersion:2,revision:0,demo:value?.demo!==false,continuationLimit,services,selection:services[0]?.models[0]?{serviceId:'legacy',modelId:services[0].models[0].id}:null});
}

export async function modelConfigStore(directory,{envKey=''}={}){
  const file=path.join(directory,'model.json');
  let saved;
  try{saved=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error('无法读取模型配置，请检查 model.json 或从备份恢复。');}
  let config=migrate(saved),keys=new Map(),queue=Promise.resolve();
  const defaultService=selectedService(config)||config.services[0];
  if(envKey&&defaultService)keys.set(defaultService.id,envKey);
  function read(){
    const active=selectedService(config),model=selectedModel(config);
    return {...structuredClone(config),endpoint:active?.endpoint||'',model:model?.id||'',hasKey:!!keys.get(active?.id),
      services:config.services.map(item=>({...structuredClone(item),hasKey:!!keys.get(item.id)}))};
  }
  function transact(revision,change){
    const result=queue.then(async()=>{
      if(revision!==undefined&&revision!==config.revision)fail('模型配置已在其他窗口更新，请重新载入后再保存。',409);
      const next=structuredClone(config),nextKeys=new Map(keys);
      change(next,nextKeys);reconcile(next);next.revision=config.revision+1;
      await fs.mkdir(directory,{recursive:true});
      const temporary=path.join(directory,`.model-${randomUUID()}.tmp`);
      try{
        await fs.writeFile(temporary,JSON.stringify(next,null,2),'utf8');
        await fs.rename(temporary,file);
      }catch(error){await fs.rm(temporary,{force:true}).catch(()=>{});throw error;}
      config=next;keys=nextKeys;return read();
    });
    queue=result.catch(()=>{});return result;
  }
  function update(body){return transact(body.revision,(next,nextKeys)=>{
    if(body.continuationLimit!==undefined){
      if(!Number.isInteger(body.continuationLimit)||body.continuationLimit<1||body.continuationLimit>10000)fail('续写字数上限需为 1–10000 之间的整数。');
      next.continuationLimit=body.continuationLimit;
    }
    // Preserve the original single-endpoint API for existing pages and integrations.
    if(body.endpoint!==undefined||body.model!==undefined){
      if(typeof body.endpoint!=='string'||typeof body.model!=='string')fail('模型配置格式无效。');
      const previous=selectedService(next)||next.services.find(item=>item.id==='legacy');
      const id=previous?.id||'legacy';
      if(body.endpoint.trim()){
        const normalized=service({name:previous?.name||'默认服务',endpoint:body.endpoint,enabled:true,models:body.model.trim()?[{id:body.model,name:body.model}]:[]},id);
        next.services=[...next.services.filter(item=>item.id!==id),normalized];
        next.selection=normalized.models[0]?{serviceId:id,modelId:normalized.models[0].id}:null;
        if(previous?.endpoint!==normalized.endpoint)nextKeys.delete(id);
        if(!previous&&envKey)nextKeys.set(id,envKey);
      }
      if(body.clearKey)nextKeys.delete(id);
      else if(typeof body.key==='string'&&body.key)nextKeys.set(id,text(body.key,'API Key',8192));
    }
    if(body.selection!==undefined){
      if(!body.selection||typeof body.selection.serviceId!=='string'||typeof body.selection.modelId!=='string')fail('请选择有效的服务和模型。');
      next.selection={serviceId:body.selection.serviceId,modelId:body.selection.modelId};
      if(!selectedService(next)?.enabled||!selectedModel(next))fail('所选服务已停用，或模型已被移除，请重新选择。');
    }
    if(body.demo!==undefined){
      if(typeof body.demo!=='boolean')fail('演示模式配置无效。');
      if(!body.demo&&(!selectedService(next)?.enabled||!selectedModel(next)))fail('请先添加并启用服务，再选择一个模型。');
      next.demo=body.demo;
    }
  });}
  function upsert(body){return transact(body.revision,(next,nextKeys)=>{
    const input=body.service,id=input?.id||randomUUID();
    if(input?.id&&!next.services.some(item=>item.id===id))fail('服务已不存在，请重新载入。',409);
    if(!input?.id&&next.services.length>=40)fail('最多添加 40 个服务。');
    const previous=next.services.find(item=>item.id===id),normalized=service(input,id);
    if(previous)next.services=next.services.map(item=>item.id===id?normalized:item);
    else next.services.push(normalized);
    if(body.clearKey||previous?.endpoint!==normalized.endpoint)nextKeys.delete(id);
    if(typeof body.key==='string'&&body.key)nextKeys.set(id,text(body.key,'API Key',8192));
  });}
  function remove(body){return transact(body.revision,(next,nextKeys)=>{
    if(!next.services.some(item=>item.id===body.id))fail('服务已不存在，请重新载入。',409);
    next.services=next.services.filter(item=>item.id!==body.id);nextKeys.delete(body.id);
  });}
  function resolve(selection){
    if(config.demo)fail('当前为演示模式。');
    const chosen=selection||config.selection,provider=config.services.find(item=>item.id===chosen?.serviceId),model=provider?.models.find(item=>item.id===chosen?.modelId);
    if(!provider?.enabled||!model)fail('所选服务已停用，或模型已被移除，请重新选择。');
    return {endpoint:provider.endpoint,model:model.id,key:keys.get(provider.id)||''};
  }
  return {read,update,upsert,remove,resolve};
}
