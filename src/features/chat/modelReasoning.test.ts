import {beforeEach,describe,expect,it,vi} from 'vitest';
import {readReasoning,saveReasoning} from './modelReasoning';
const values=new Map<string,string>();
beforeEach(()=>{values.clear();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});});
describe('per-model reasoning preference',()=>{
 it('stores preferences independently and defaults for unknown models',()=>{const a={serviceId:'a',modelId:'shared'},b={serviceId:'b',modelId:'shared'};saveReasoning(a,'high');saveReasoning(b,'low');expect(readReasoning(a)).toBe('high');expect(readReasoning(b)).toBe('low');expect(readReasoning({serviceId:'a',modelId:'other'})).toBe('default');});
 it('rejects unknown stored values and handles inaccessible storage',()=>{const a={serviceId:'a',modelId:'m'};saveReasoning(a,'high');values.set([...values.keys()][0],'unknown');expect(readReasoning(a)).toBe('default');vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('denied');}});expect(readReasoning(a)).toBe('default');});
});
