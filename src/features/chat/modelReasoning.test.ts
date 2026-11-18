import {beforeEach,describe,expect,it,vi} from 'vitest';
import {readReasoning,resolveModelReasoning,saveReasoning} from './modelReasoning';
import type {ModelEntry} from '../settings/modelConfig';
const values=new Map<string,string>();
beforeEach(()=>{values.clear();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});});
describe('per-model reasoning preference',()=>{
 it('stores preferences independently and defaults for unknown models',()=>{const a={serviceId:'a',modelId:'shared'},b={serviceId:'b',modelId:'shared'};saveReasoning(a,'high');saveReasoning(b,'low');expect(readReasoning(a)).toBe('high');expect(readReasoning(b)).toBe('low');expect(readReasoning({serviceId:'a',modelId:'other'})).toBe('default');});
 it('rejects unknown stored values and handles inaccessible storage',()=>{const a={serviceId:'a',modelId:'m'};saveReasoning(a,'high');values.set([...values.keys()][0],'unknown');expect(readReasoning(a)).toBe('default');vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('denied');}});expect(readReasoning(a)).toBe('default');});
 it('uses a confirmed model default and preserves explicit service default or falls back when a level is withdrawn',()=>{
   const model:ModelEntry={id:'m',name:'模型',defaultReasoning:'minimal',capabilities:{reasoning:{
     minimal:{parameter:'reasoning_effort',value:'minimal'},high:{parameter:'reasoning_effort',value:'high'},
   }}};
   expect(resolveModelReasoning(model,undefined)).toEqual({effort:'minimal',dropped:false});
   expect(resolveModelReasoning(model,'default')).toEqual({effort:'default',dropped:false});
   expect(resolveModelReasoning(model,'high')).toEqual({effort:'high',dropped:false});
   expect(resolveModelReasoning({...model,reasoningLevels:['minimal']},'high')).toEqual({effort:'default',dropped:true});
   expect(resolveModelReasoning({...model,capabilities:undefined},undefined)).toEqual({effort:'default',dropped:true});
 });
 it('reactivates an explicitly declared manual level even if the catalog only provides an ID',()=>{
   const model:ModelEntry={id:'m',name:'模型',manualReasoningLevels:['off','max'],defaultReasoning:'max'};
   expect(resolveModelReasoning(model,undefined)).toEqual({effort:'max',dropped:false});
   expect(resolveModelReasoning(model,'off')).toEqual({effort:'off',dropped:false});
   expect(resolveModelReasoning(model,'high')).toEqual({effort:'default',dropped:true});
 });
});
