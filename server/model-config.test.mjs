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
  it('stores multiple independent services, allows identical model IDs, and never persists keys',async()=>{
    const store=await modelConfigStore(directory);
    await store.upsert({service:provider('服务 A'),key:'private-key-A'});
    await store.upsert({service:provider('服务 B','http://127.0.0.1:4568/v1'),key:'private-key-B'});
    const config=store.read(),[a,b]=config.services;
    await store.update({revision:config.revision,demo:false,selection:{serviceId:a.id,modelId:'shared-id'}});
    expect(store.resolve()).toEqual({endpoint:a.endpoint,model:'shared-id',key:'private-key-A'});
    expect(store.resolve({serviceId:b.id,modelId:'shared-id'}).key).toBe('private-key-B');
    const disk=await fs.readFile(path.join(directory,'model.json'),'utf8');
    expect(disk).not.toContain('private-key');expect(JSON.stringify(store.read())).not.toContain('private-key');
    const restarted=await modelConfigStore(directory);
    expect(restarted.read().services).toHaveLength(2);expect(restarted.read().services.every(item=>!item.hasKey)).toBe(true);
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
});
