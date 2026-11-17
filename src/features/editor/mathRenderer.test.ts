import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {MathRenderQueue,MATH_QUEUE_LIMIT,MATH_CACHE_ENTRIES,MATH_CACHE_CHARACTERS,type MathWorker} from './mathRenderer';
import type {MathResult} from './mathRender';

class FakeWorker implements MathWorker{
  onmessage:MathWorker['onmessage']=null;onerror:MathWorker['onerror']=null;
  messages:{id:number;source:string;displayMode:boolean}[]=[];terminated=false;
  postMessage(message:{id:number;source:string;displayMode:boolean}){this.messages.push(message);}
  terminate(){this.terminated=true;}
  reply(result:MathResult,id=this.messages.at(-1)!.id){this.onmessage?.({data:{id,...result}} as MessageEvent<MathResult&{id:number}>);}
}
let workers:FakeWorker[],queue:MathRenderQueue;
beforeEach(()=>{vi.useFakeTimers();workers=[];queue=new MathRenderQueue(()=>{const worker=new FakeWorker();workers.push(worker);return worker;});});
afterEach(()=>{queue.dispose();vi.useRealTimers();});
describe('mounted-formula worker queue',()=>{
  it('creates workers lazily, deduplicates jobs and reuses a bounded cache',()=>{
    expect(workers).toHaveLength(0);const first=vi.fn(),second=vi.fn();
    queue.request('x',false,first);queue.request('x',false,second);vi.advanceTimersByTime(1);
    expect(workers).toHaveLength(1);expect(workers[0].messages).toHaveLength(1);
    workers[0].reply({html:'<span>x</span>'});expect(first).toHaveBeenCalledTimes(1);expect(second).toHaveBeenCalledTimes(1);
    const cached=vi.fn();queue.request('x',false,cached);vi.advanceTimersByTime(1);
    expect(cached).toHaveBeenCalledWith({html:'<span>x</span>'});expect(workers[0].messages).toHaveLength(1);
  });
  it('cancels cached and budget fallback deliveries when disposed before delivery',()=>{
    queue.request('x',false,vi.fn());vi.advanceTimersByTime(1);workers[0].reply({html:'x'});
    const cached=vi.fn(),overBudget=vi.fn();queue.request('x',false,cached);queue.request('x'.repeat(4097),false,overBudget);
    queue.dispose();vi.advanceTimersByTime(10);expect(cached).not.toHaveBeenCalled();expect(overBudget).not.toHaveBeenCalled();
  });
  it('never delivers destroyed, canceled or late results to a new job',()=>{
    const stale=vi.fn(),latest=vi.fn(),cancel=queue.request('old',false,stale);vi.advanceTimersByTime(1);
    const old=workers[0],id=old.messages[0].id;cancel();expect(old.terminated).toBe(true);
    queue.request('new',false,latest);vi.advanceTimersByTime(1);old.reply({html:'old'},id);
    expect(stale).not.toHaveBeenCalled();expect(latest).not.toHaveBeenCalled();
    workers[1].reply({html:'new'});expect(latest).toHaveBeenCalledWith({html:'new'});
  });
  it('terminates a hung worker and advances queued work with an explicit source fallback',()=>{
    const first=vi.fn(),second=vi.fn();queue.request('hang',false,first);queue.request('next',false,second);vi.advanceTimersByTime(1502);
    expect(workers[0].terminated).toBe(true);expect(first.mock.calls[0][0].error).toContain('超时');expect(workers).toHaveLength(2);
    workers[1].reply({html:'next'});expect(second).toHaveBeenCalledTimes(1);
    queue.request('hang',false,vi.fn());vi.advanceTimersByTime(1);expect(workers[1].messages).toHaveLength(2);
  });
  it('limits queued jobs and drops canceled unstarted work without reading or posting it',()=>{
    const cancel=queue.request('cancel',false,vi.fn());cancel();const result=vi.fn();
    for(let index=0;index<MATH_QUEUE_LIMIT+10;index++)queue.request('f'+index,false,result);
    expect(queue.diagnostics.queued).toBe(MATH_QUEUE_LIMIT);vi.advanceTimersByTime(1);
    expect(workers[0].messages).toHaveLength(1);expect(workers[0].messages[0].source).not.toBe('cancel');
    expect(result.mock.calls.filter(call=>call[0].error?.includes('排队预算'))).toHaveLength(10);
  });
  it('bounds both cache character count and entry count and releases the idle worker',()=>{
    for(let index=0;index<MATH_CACHE_ENTRIES+20;index++){
      queue.request('formula-'+index,false,vi.fn());vi.advanceTimersByTime(1);workers.at(-1)!.reply({html:'x'.repeat(8000)});
      expect(queue.diagnostics.cacheCharacters).toBeLessThanOrEqual(MATH_CACHE_CHARACTERS);expect(queue.diagnostics.cached).toBeLessThanOrEqual(MATH_CACHE_ENTRIES);
    }
    vi.advanceTimersByTime(10001);expect(workers.at(-1)!.terminated).toBe(true);
  });
});
