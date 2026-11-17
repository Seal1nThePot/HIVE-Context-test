import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {MathCommitQueue,MATH_DOM_QUEUE_LIMIT} from './mathCommitQueue';
let queue:MathCommitQueue;
beforeEach(()=>{vi.useFakeTimers();queue=new MathCommitQueue();});
afterEach(()=>{queue.dispose();vi.useRealTimers();});
describe('math DOM commit budget',()=>{
  it('commits at most two results per 16ms tick, including already computed results',()=>{
    const commits=vi.fn();for(let index=0;index<10;index++)queue.enqueue(commits);
    // Production enqueues distinct widget closures, even for identical formula/cache keys.
    expect(queue.size).toBe(1);queue.dispose();
    for(let index=0;index<10;index++)queue.enqueue(()=>commits());
    vi.advanceTimersByTime(15);expect(commits).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);expect(commits).toHaveBeenCalledTimes(2);expect(queue.size).toBe(8);
    vi.advanceTimersByTime(16);expect(commits).toHaveBeenCalledTimes(4);
  });
  it('cancels disposed widgets, bounds waiting closures and drops all callbacks on dispose',()=>{
    const removed=vi.fn(),cancel=queue.enqueue(removed)!;cancel();
    const live=vi.fn();for(let index=0;index<MATH_DOM_QUEUE_LIMIT;index++)expect(queue.enqueue(()=>live())).not.toBeNull();
    expect(queue.enqueue(()=>live())).toBeNull();expect(queue.size).toBe(MATH_DOM_QUEUE_LIMIT);
    vi.advanceTimersByTime(16);expect(removed).not.toHaveBeenCalled();expect(live).toHaveBeenCalledTimes(2);
    queue.dispose();vi.advanceTimersByTime(10000);expect(live).toHaveBeenCalledTimes(2);expect(queue.size).toBe(0);
  });
});
