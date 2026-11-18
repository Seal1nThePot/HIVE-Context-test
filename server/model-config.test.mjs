import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {modelConfigStore} from './model-config.mjs';

let directory;
beforeEach(async()=>{directory=await fs.mkdtemp(path.join(os.tmpdir(),'hive-model-config-'));});
afterEach(async()=>{if(path.dirname(directory)===os.tmpdir()&&path.basename(directory).startsWith('hive-model-config-'))await fs.rm(directory,{recursive:true,force:true});});
const provider=(name,endpoint='http://127.0.0.1:4567/v1')=>({name,endpoint,enabled:true,models:[{id:'shared-id',name:'我的模型'},{id:'second-model',name:'第二模型'}]});
describe('service and model configuration',()=>{
  it('migrates the legacy connection and retains its model, settings and environment key',async()=>{
    await fs.writeFile(path.join(directory,'model.json'),JSON.stringify({endpoint:'http://localhost:4567/v1',model:'legacy-model',demo:false,continuationLimit:333}));
    const store=await modelConfigStore(directory,{envKey:'environment-secret'}),config=store.read();
    expect(config.services).toHaveLength(1);expect(config.services[0].name).toBe('默认服务');
    expect(config.selection).toEqual({serviceId:'legacy',modelId:'legacy-model'});
    expect(config.continuationLimit).toBe(333);expect(config.demo).toBe(false);expect(config.hasKey).toBe(true);
    expect(JSON.stringify(config)).not.toContain('environment-secret');
    expect(store.resolve().key).toBe('environment-secret');
  });
  it('stores multiple independent services, allows identical model IDs, and keeps keys out of model.json and read()',async()=>{
    const store=await modelConfigStore(directory);
    await store.upsert({service:provider('服务 A'),key:'private-key-A'});
    await store.upsert({service:provider('服务 B','http://127.0.0.1:4568/v1'),key:'private-key-B'});
    const config=store.read(),[a,b]=config.services;
    await store.update({revision:config.revision,demo:false,selection:{serviceId:a.id,modelId:'shared-id'}});
    expect(store.resolve()).toEqual({endpoint:a.endpoint,model:'shared-id',modelConfig:a.models[0],key:'private-key-A'});
    expect(store.resolve({serviceId:b.id,modelId:'shared-id'}).key).toBe('private-key-B');
    const disk=await fs.readFile(path.join(directory,'model.json'),'utf8');
    expect(disk).not.toContain('private-key');expect(JSON.stringify(store.read())).not.toContain('private-key');
    expect(JSON.parse(await fs.readFile(path.join(directory,'keys.json'),'utf8'))).toEqual({
      [a.id]:{endpoint:a.endpoint+'/chat/completions',key:'private-key-A'},
      [b.id]:{endpoint:b.endpoint+'/chat/completions',key:'private-key-B'},
    });
    const restarted=await modelConfigStore(directory);
    expect(restarted.read().services).toHaveLength(2);expect(restarted.read().services.every(item=>item.hasKey)).toBe(true);
    expect(restarted.resolve({serviceId:b.id,modelId:'shared-id'}).key).toBe('private-key-B');
    expect(JSON.stringify(restarted.read())).not.toContain('private-key');
    expect(restarted.read().selection).toEqual({serviceId:a.id,modelId:'shared-id'});
  });
  it('keeps the request selection stable while the default model changes',async()=>{
    const store=await modelConfigStore(directory);await store.upsert({service:provider('服务')});
    const id=store.read().services[0].id;
    await store.update({demo:false,selection:{serviceId:id,modelId:'shared-id'}});
    const selection=store.read().selection;
    await store.update({demo:false,selection:{serviceId:id,modelId:'second-model'}});
    expect(store.resolve(selection).model).toBe('shared-id');expect(store.resolve().model).toBe('second-model');
  });
  it('switches to demo when the active service is disabled or its model is removed',async()=>{
    const store=await modelConfigStore(directory);await store.upsert({service:provider('服务')});
    const service=store.read().services[0];
    await store.update({demo:false,selection:{serviceId:service.id,modelId:'shared-id'}});
    await store.upsert({service:{...service,enabled:false}});
    expect(store.read().demo).toBe(true);expect(()=>store.resolve()).toThrow('演示模式');
    await expect(store.update({demo:false,selection:{serviceId:service.id,modelId:'shared-id'}})).rejects.toThrow('已停用');
    await store.upsert({service:{...service,enabled:true}});
    expect(store.read().demo).toBe(true);
    await store.update({demo:false,selection:{serviceId:service.id,modelId:'shared-id'}});
    await store.upsert({service:{...service,models:[service.models[1]]}});
    expect(store.read().demo).toBe(true);expect(store.read().selection).toBeNull();
  });
  it('clears only the intended credential, and does not carry it to a different endpoint',async()=>{
    const store=await modelConfigStore(directory);await store.upsert({service:provider('服务'),key:'private-key'});
    const service=store.read().services[0];
    await store.upsert({service:{...service,name:'改名'}});expect(store.read().services[0].hasKey).toBe(true);
    await store.upsert({service:{...service,endpoint:'http://localhost:9876/v1'}});expect(store.read().services[0].hasKey).toBe(false);
    await store.upsert({service,key:'new-key'});expect(store.read().services[0].hasKey).toBe(true);
    await store.upsert({service,clearKey:true});expect(store.read().services[0].hasKey).toBe(false);
  });
  it('rejects duplicate model IDs and embedded endpoint credentials without changing state',async()=>{
    const store=await modelConfigStore(directory);
    await expect(store.upsert({service:{...provider('服务'),models:[{id:'one',name:'甲'},{id:'one',name:'乙'}]}})).rejects.toThrow('重复');
    await expect(store.upsert({service:provider('服务','http://user:password@localhost/v1')})).rejects.toThrow('凭据');
    await expect(store.upsert({service:provider('服务','http://localhost/v1?')})).rejects.toThrow('查询参数');
    await expect(store.upsert({service:provider('服务','http://localhost/v1#')})).rejects.toThrow('片段');
    expect(store.read().services).toEqual([]);expect(store.read().revision).toBe(0);
  });
  it('detects stale concurrent updates and does not overwrite the first saved service',async()=>{
    const store=await modelConfigStore(directory),revision=store.read().revision;
    const results=await Promise.allSettled([store.upsert({revision,service:provider('先保存')}),store.upsert({revision,service:provider('旧窗口')})]);
    expect(results[0].status).toBe('fulfilled');expect(results[1].status).toBe('rejected');
    expect(store.read().services.map(item=>item.name)).toEqual(['先保存']);
  });
  it('removes one service and its key without altering the remaining service',async()=>{
    const store=await modelConfigStore(directory);await store.upsert({service:provider('服务 A'),key:'key-A'});await store.upsert({service:provider('服务 B'),key:'key-B'});
    const [a,b]=store.read().services;
    await store.update({demo:false,selection:{serviceId:a.id,modelId:'shared-id'}});
    await store.remove({id:a.id});expect(store.read().demo).toBe(true);expect(store.read().selection).toBeNull();
    expect(store.read().services).toEqual([b]);
    await store.update({demo:false,selection:{serviceId:b.id,modelId:'shared-id'}});expect(store.resolve().key).toBe('key-B');
  });
  it('retains model preferences, service order, selection and bound credentials across restart',async()=>{
    const store=await modelConfigStore(directory);
    const reasoning={low:{parameter:'reasoning_effort',value:'low'},max:{parameter:'thinking.type',value:'enabled'}};
    const aInput=provider('服务甲'),bInput=provider('服务乙','http://localhost:7879/prefix/v1');
    const model={...aInput.models[0],contextTokens:4096,capabilities:{contextTokens:8192,reasoning},reasoningLevels:['max'],defaultReasoning:'max'};
    const initial=await store.upsert({service:{...aInput,models:[aInput.models[1],model]},key:'saved-only-A'});
    const a=initial.services[0];
    const b=(await store.upsert({revision:initial.revision,service:bInput,key:'saved-only-B'})).services[1];
    const selected=await store.update({demo:false,selection:{serviceId:a.id,modelId:model.id}});
    await expect(store.reorder({revision:selected.revision,ids:[a.id,a.id]})).rejects.toThrow('顺序');
    const sorted=await store.reorder({revision:selected.revision,ids:[b.id,a.id]});
    await expect(store.reorder({revision:selected.revision,ids:[a.id,b.id]})).rejects.toThrow('其他窗口');
    const restarted=await modelConfigStore(directory);
    expect(restarted.read()).toEqual(sorted);
    expect(restarted.resolve()).toMatchObject({key:'saved-only-A',modelConfig:model});
    expect(restarted.resolve({serviceId:b.id,modelId:model.id})).toMatchObject({key:'saved-only-B',modelConfig:b.models[0]});
    const updated=await restarted.upsert({revision:sorted.revision,service:{...a,models:[a.models[0],{...model,capabilities:{reasoning:{low:reasoning.low}}}]}});
    expect(updated.selection).toEqual(sorted.selection);
    expect(updated.services[1].models[1]).toMatchObject({name:model.name,contextTokens:4096,reasoningLevels:[]});
    expect(updated.services[1].models[1]).not.toHaveProperty('defaultReasoning');
  });
  it('migrates old unbound keys and never loads a bound key under a different endpoint',async()=>{
    const store=await modelConfigStore(directory);
    const first=await store.upsert({service:provider('服务甲')});
    const a=first.services[0];
    await fs.writeFile(path.join(directory,'keys.json'),JSON.stringify({[a.id]:'old-file-test-key'}));
    const legacyKeys=await modelConfigStore(directory);
    expect(legacyKeys.resolveProbe({revision:first.revision,service:{id:a.id,endpoint:a.endpoint+'/chat/completions/'}}).key).toBe('old-file-test-key');
    const changed=await legacyKeys.upsert({service:{...a,endpoint:'http://localhost:4567/new/v1'},key:'old-file-test-key'});
    expect((await modelConfigStore(directory)).read().services[0].hasKey).toBe(true);
    const modelData=JSON.parse(await fs.readFile(path.join(directory,'model.json'),'utf8'));
    modelData.services[0].endpoint=a.endpoint;
    await fs.writeFile(path.join(directory,'model.json'),JSON.stringify(modelData));
    const mismatched=await modelConfigStore(directory,{envKey:'environment-test-key'});
    expect(mismatched.resolveProbe({revision:changed.revision,service:a}).key).toBe('');
  });
  it('does not reapply an environment credential after explicit clear and restart',async()=>{
    const envKey='test-environment-credential';
    await fs.writeFile(path.join(directory,'model.json'),JSON.stringify({endpoint:'http://localhost:4567/v1',model:'legacy-test',demo:false}));
    const store=await modelConfigStore(directory,{envKey});
    expect(store.resolve().key).toBe(envKey);
    const {revision,services:[saved]}=store.read();
    const cleared=await store.upsert({revision,service:saved,clearKey:true,key:'ignored-fixture-key'});
    const restarted=await modelConfigStore(directory,{envKey});
    expect(restarted.read()).toEqual(cleared);
    expect(restarted.resolve().key).toBe('');
  });
  it('persists explicit manual levels and capacity for each model across restart and validates the new input',async()=>{
    const store=await modelConfigStore(directory);
    const original=provider('手动档位');
    const model={...original.models[0],manualReasoningLevels:['max','off'],defaultReasoning:'max',contextTokens:120000,maxOutputTokens:32768};
    await store.upsert({service:{...original,models:[model,original.models[1]]}});
    const restart=await modelConfigStore(directory);
    const {revision,services:[saved]}=restart.read();
    expect(saved.models).toEqual([{...model,manualReasoningLevels:['off','max']},original.models[1]]);
    const update=model=>restart.upsert({revision,service:{...saved,models:[model]}});
    for(const levelList of [['unrecognized'],['low','low','low','low','low','low','low','low'],'max']){
      await expect(update({...model,manualReasoningLevels:levelList})).rejects.toMatchObject({status:400});
    }
    for(const capacity of [0,1.5,-1,'500',Number.MAX_SAFE_INTEGER+1]){
      await expect(update({...model,contextTokens:capacity})).rejects.toMatchObject({status:400});
      await expect(update({...model,maxOutputTokens:capacity})).rejects.toMatchObject({status:400});
    }
    await expect(update({...model,maxOutputTokens:120000})).rejects.toThrow('为输入预留空间');
    await expect(update({...model,capabilities:{maxOutputTokens:16000}})).rejects.toThrow('上游公布的上限');
    const cleared=await update({...model,manualReasoningLevels:[],contextTokens:undefined,maxOutputTokens:undefined});
    expect(cleared.services[0].models[0]).toEqual({...original.models[0],manualReasoningLevels:[]});
    expect((await modelConfigStore(directory)).read()).toEqual(cleared);
  });
  it('stores declared input types and rejects unknown ones',async()=>{
    const store=await modelConfigStore(directory);
    const input=provider('服务');
    const model={...input.models[0],inputTypes:['image','text'],capabilities:{input:['text']}};
    const saved=await store.upsert({service:{...input,models:[model]}});
    expect(saved.services[0].models[0]).toEqual({...model,inputTypes:['text','image']});
    await expect(store.upsert({revision:saved.revision,service:{...input,models:[{...model,inputTypes:['audio']}]}})).rejects.toThrow('输入类型配置无效');
    await expect(store.upsert({revision:saved.revision,service:{...input,models:[{...model,inputTypes:['text','image','text']}]}})).rejects.toMatchObject({status:400});
    expect(store.read().services[0].models[0].inputTypes).toEqual(['text','image']);
  });
});
