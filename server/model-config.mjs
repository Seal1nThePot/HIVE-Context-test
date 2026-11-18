import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {cleanCapabilities, configurationLimit, effectiveReasoningLevels, inputTypes, reasoningLevels, tokenCapacity} from './model-capabilities.mjs';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function text(value,label,max=200){
  if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\r\n\0]/.test(value))fail(`${label}格式无效。`);
  return value.trim();
}
export function modelEndpoints(value){
  const input=text(value,'接口地址',4096);
  let url;try{url=new URL(input);}catch{fail('请填写有效的 HTTP(S) 接口地址。');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||input.includes('?')||input.includes('#'))
    fail('接口地址不能包含凭据、查询参数或片段。');
  const endpoint = (url.origin+url.pathname).replace(/\/+$/, '');
  const base = endpoint.replace(/\/chat\/completions$/, '');
  return {endpoint, chat:base+'/chat/completions', models:base+'/models'};
}

function configuredLevels(value){
  if(!Array.isArray(value)||value.length>reasoningLevels.length||value.some(level=>!reasoningLevels.includes(level)))fail('推理档位配置无效。');
  return reasoningLevels.filter(level=>value.includes(level));
}

function configuredInputs(value){
  if(!Array.isArray(value)||value.length>inputTypes.length||value.some(type=>!inputTypes.includes(type)))fail('输入类型配置无效。');
  return inputTypes.filter(type=>value.includes(type));
}

function modelEntry(item){
  const entry={id:text(item?.id,'模型 ID'),name:text(item?.name||item?.id,'模型名称')};
  const capabilities=cleanCapabilities(item.capabilities);
  if(capabilities)entry.capabilities=capabilities;
  if(item.contextTokens!==undefined){
    if(!tokenCapacity(item.contextTokens))fail('上下文容量需为有效的正整数 token。');
    entry.contextTokens=item.contextTokens;
  }
  if(item.maxOutputTokens!==undefined){
    const limit=tokenCapacity(item.maxOutputTokens);
    if(!limit)fail('最大输出长度需为有效的正整数 token。');
    const context=entry.contextTokens??capabilities?.contextTokens;
    const upstreamMax=capabilities?.maxOutputTokens;
    if(context!==undefined&&limit>=context)fail('最大输出长度必须小于上下文窗口，为输入预留空间。');
    if(upstreamMax!==undefined&&limit>upstreamMax)fail('最大输出长度不能超过上游公布的上限。');
    entry.maxOutputTokens=limit;
  }
  if(item.reasoningLevels!==undefined){
    entry.reasoningLevels=configuredLevels(item.reasoningLevels).filter(level=>capabilities?.reasoning?.[level]);
  }
  if(item.manualReasoningLevels!==undefined){
    entry.manualReasoningLevels=configuredLevels(item.manualReasoningLevels);
  }
  if(item.inputTypes!==undefined){
    entry.inputTypes=configuredInputs(item.inputTypes);
  }
  if(effectiveReasoningLevels(entry).includes(item.defaultReasoning))entry.defaultReasoning=item.defaultReasoning;
  return entry;
}

function service(value,id){
  if(!value||typeof value!=='object'||typeof value.enabled!=='boolean'||!Array.isArray(value.models))fail('服务配置格式无效。');
  if(value.models.length>configurationLimit)fail(`每个服务最多配置 ${configurationLimit} 个模型。`);
  const models=value.models.map(modelEntry);
  if(new Set(models.map(item=>item.id)).size!==models.length)fail('同一个服务中不能重复添加相同模型 ID。');
  return {id,name:text(value.name,'服务名称',120),endpoint:modelEndpoints(value.endpoint).endpoint,enabled:value.enabled,models};
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

async function readKeys(file,services){
  let raw;try{raw=await fs.readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')return {keys:new Map(),exists:false};throw error;}
  let value;try{value=JSON.parse(raw);}catch{return {keys:new Map(),exists:true};}
  const keys=new Map();
  for(const provider of services){
    const endpoint=modelEndpoints(provider.endpoint).chat;
    const saved=value?.[provider.id];
    const key=typeof saved==='string'?saved:saved?.endpoint===endpoint?saved.key:undefined;
    if(typeof key==='string'&&key.trim())keys.set(provider.id,key);
  }
  return {keys,exists:true};
}
function sameKeys(a,b){
  if(a.size!==b.size)return false;
  for(const [id,key] of a)if(b.get(id)!==key)return false;
  return true;
}
async function writeKeys(directory,file,keys,services){
  const temporary=path.join(directory,`.keys-${randomUUID()}.tmp`);
  const entries=services.flatMap(provider=>keys.has(provider.id)?[[provider.id,{endpoint:modelEndpoints(provider.endpoint).chat,key:keys.get(provider.id)}]]:[]);
  try{
    await fs.writeFile(temporary,JSON.stringify(Object.fromEntries(entries),null,2),{encoding:'utf8',mode:0o600});
    await fs.rename(temporary,file);
  }catch(error){await fs.rm(temporary,{force:true}).catch(()=>{});throw error;}
}

// Keys are persisted in plain text beside model.json: the app must survive a restart
// without re-entering them, and read() must never hand them to the renderer.
export async function modelConfigStore(directory,{envKey=''}={}){
  const file=path.join(directory,'model.json');
  const keyFile=path.join(directory,'keys.json');
  let saved;
  try{saved=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error('无法读取模型配置，请检查 model.json 或从备份恢复。');}
  let config=migrate(saved),queue=Promise.resolve();
  const persisted=await readKeys(keyFile,config.services);
  let keys=persisted.keys, keysExist=persisted.exists;
  const defaultService=selectedService(config)||config.services[0];
  if(envKey&&defaultService&&!keysExist)keys.set(defaultService.id,envKey);
  function read(){
    const active=selectedService(config),model=selectedModel(config);
    return {...structuredClone(config),endpoint:active?.endpoint||'',model:model?.id||'',hasKey:!!keys.get(active?.id),
      services:config.services.map(item=>({...structuredClone(item),hasKey:!!keys.get(item.id)}))};
  }
  function checkRevision(revision){
    if(revision!==undefined&&revision!==config.revision)fail('模型配置已在其他窗口更新，请重新载入后再保存。',409);
  }
  function transact(revision,change){
    const result=queue.then(async()=>{
      checkRevision(revision);
      const next=structuredClone(config),nextKeys=new Map(keys);
      change(next,nextKeys);reconcile(next);next.revision=config.revision+1;
      await fs.mkdir(directory,{recursive:true});
      const changedBinding=config.services.some(provider=>keys.has(provider.id)&&!sameEndpoint(provider,next.services.find(item=>item.id===provider.id)));
      const writeCredentials=changedBinding||!sameKeys(keys,nextKeys)||(!keysExist&&!!envKey);
      const temporary=path.join(directory,`.model-${randomUUID()}.tmp`);
      try{
        await fs.writeFile(temporary,JSON.stringify(next,null,2),'utf8');
        if(writeCredentials)await writeKeys(directory,keyFile,nextKeys,next.services);
        await fs.rename(temporary,file);
      }catch(error){
        await fs.rm(temporary,{force:true}).catch(()=>{});
        if(writeCredentials)await writeKeys(directory,keyFile,keys,config.services).catch(()=>{});
        throw error;
      }
      if(writeCredentials)keysExist=true;
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
        const target=modelEndpoints(body.endpoint);
        const previousModel=sameEndpoint(previous,target)?previous.models.find(item=>item.id===body.model.trim()):undefined;
        const normalized=service({name:previous?.name||'默认服务',endpoint:target.endpoint,enabled:true,models:body.model.trim()?[previousModel||{id:body.model,name:body.model}]:[]},id);
        next.services=[...next.services.filter(item=>item.id!==id),normalized];
        next.selection=normalized.models[0]?{serviceId:id,modelId:normalized.models[0].id}:null;
        if(!sameEndpoint(previous,normalized))nextKeys.delete(id);
        if(!previous&&envKey&&!keysExist&&!nextKeys.size)nextKeys.set(id,envKey);
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
    if(body.clearKey||!sameEndpoint(previous,normalized))nextKeys.delete(id);
    if(!body.clearKey&&typeof body.key==='string'&&body.key)nextKeys.set(id,text(body.key,'API Key',8192));
  });}
  function remove(body){return transact(body.revision,(next,nextKeys)=>{
    if(!next.services.some(item=>item.id===body.id))fail('服务已不存在，请重新载入。',409);
    next.services=next.services.filter(item=>item.id!==body.id);nextKeys.delete(body.id);
  });}
  function reorder(body){return transact(body.revision,next=>{
    if(!Number.isInteger(body.revision))fail('请重新载入模型配置。',409);
    const byId=new Map(next.services.map(item=>[item.id,item]));
    if(!Array.isArray(body.ids)||body.ids.length!==byId.size||new Set(body.ids).size!==byId.size||body.ids.some(id=>!byId.has(id)))fail('服务顺序已失效，请重新载入。',409);
    next.services=body.ids.map(id=>byId.get(id));
  });}
  function sameEndpoint(previous, next){
    return previous && next && modelEndpoints(previous.endpoint).chat===modelEndpoints(next.endpoint).chat;
  }
  function resolveProbe(body){
    if(!Number.isInteger(body.revision))fail('请重新载入模型配置。',409);
    checkRevision(body.revision);
    const endpoint=modelEndpoints(body.service?.endpoint).endpoint;
    const id=body.service?.id;
    const saved=config.services.find(item=>item.id===id);
    if(id!==undefined&&!saved)fail('服务已不存在，请重新载入。',409);
    if(body.key!==undefined&&typeof body.key!=='string'||body.clearKey!==undefined&&typeof body.clearKey!=='boolean')fail('密钥选项无效。');
    const key=body.clearKey?'':body.key?.trim()?text(body.key,'API Key',8192):sameEndpoint(saved,{endpoint})?(keys.get(id)||''):'';
    const model=body.modelId===undefined?undefined:text(body.modelId,'模型 ID');
    return {endpoint,key,model};
  }
  function resolve(selection){
    if(config.demo)fail('当前为演示模式。');
    const chosen=selection||config.selection,provider=config.services.find(item=>item.id===chosen?.serviceId),model=provider?.models.find(item=>item.id===chosen?.modelId);
    if(!provider?.enabled||!model)fail('所选服务已停用，或模型已被移除，请重新选择。');
    return {endpoint:provider.endpoint,model:model.id,key:keys.get(provider.id)||'',modelConfig:structuredClone(model)};
  }
  return {read,update,upsert,remove,reorder,resolve,resolveProbe,checkRevision};
}
