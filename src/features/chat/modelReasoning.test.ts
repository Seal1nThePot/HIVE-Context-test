import {beforeEach,describe,expect,it,vi} from 'vitest';
import {previewReasoningDrag,readReasoning,reasoningSnapIndex,resolveModelReasoning,saveReasoning} from './modelReasoning';
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

describe('reasoning slider snap',()=>{
  it('captures near a stop, holds farther out, and frees the thumb between stops',()=>{
    const snap=(x:number,held:number|null=null)=>reasoningSnapIndex(x/300,300,6,held);
    expect(snap(94)).toBe(2);
    expect(snap(108)).toBeNull();
    expect(snap(108,2)).toBe(2);
    expect(snap(113,2)).toBeNull();
    expect(snap(146,2)).toBe(3);
  });

  it('leaves a continuous interval when stops are close together',()=>{
    const snap=(x:number,held:number|null=null)=>reasoningSnapIndex(x/42,42,6,held);
    expect(snap(15.1)).toBe(2);
    expect(snap(16.2,2)).toBe(2);
    expect(snap(17.5,2)).toBeNull();
    expect(snap(20,2)).toBe(3);
  });

  it('captures both endpoints and skips snapping for a single stop',()=>{
    expect(reasoningSnapIndex(0,300,1,null)).toBe(0);
    expect(reasoningSnapIndex(1,300,1,0)).toBe(1);
    expect(reasoningSnapIndex(1,300,0,null)).toBeNull();
  });
});

describe('reasoning slider preview',()=>{
  it('uses the nearest level while the thumb follows the pointer between stops in either direction',()=>{
    const preview=(x:number,heldIndex:number|null)=>previewReasoningDrag(x/300,300,6,heldIndex);
    expect(preview(24,0)).toEqual({ratio:24/300,index:0,snapIndex:null});
    expect(preview(26,0)).toEqual({ratio:26/300,index:1,snapIndex:null});
    expect(preview(26,1)).toEqual({ratio:26/300,index:1,snapIndex:null});
    expect(preview(24,1)).toEqual({ratio:24/300,index:0,snapIndex:null});
  });

  it('uses the same level and position while a stop remains captured',()=>{
    expect(previewReasoningDrag(108/300,300,6,2)).toEqual({ratio:2/6,index:2,snapIndex:2});
    expect(previewReasoningDrag(108/300,300,6,null)).toEqual({ratio:108/300,index:2,snapIndex:null});
  });
});
