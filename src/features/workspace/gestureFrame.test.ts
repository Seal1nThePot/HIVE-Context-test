import {describe,it,expect,vi} from 'vitest';
import {latestGestureFrame} from './gestureFrame';

function clock(){
  let next=0;const callbacks=new Map<number,()=>void>();
  return {request:(callback:()=>void)=>{const id=next++;callbacks.set(id,callback);return id;},cancel:(id:number)=>{callbacks.delete(id);},
    tick(){const jobs=[...callbacks.values()];callbacks.clear();for(const job of jobs)job();},size:()=>callbacks.size};
}
describe('pointer work per animation frame',()=>{
  it('keeps only the newest position from a burst, including a frame handle of zero',()=>{
    const timer=clock(),consume=vi.fn(),queue=latestGestureFrame(timer,consume);
    for(let i=0;i<1000;i++)queue.push({x:i,free:i===999});
    expect(timer.size()).toBe(1);expect(consume).not.toHaveBeenCalled();timer.tick();
    expect(consume).toHaveBeenCalledExactlyOnceWith({x:999,free:true});
  });
  it('flushes the final pending position before pointerup and leaves no delayed movement',()=>{
    const timer=clock(),seen:number[]=[],queue=latestGestureFrame<number>(timer,value=>seen.push(value));
    queue.push(1);queue.push(2);queue.flush();seen.push(3);timer.tick();expect(seen).toEqual([2,3]);
  });
  it('drops pending updates on cancellation or teardown',()=>{
    const timer=clock(),consume=vi.fn(),queue=latestGestureFrame(timer,consume);
    queue.push('pending');queue.cancel();timer.tick();expect(consume).not.toHaveBeenCalled();
    queue.push('next gesture');timer.tick();expect(consume).toHaveBeenCalledExactlyOnceWith('next gesture');
  });
  it('preserves a new update scheduled from inside a consumed frame',()=>{
    const timer=clock(),seen:number[]=[];
    const queue=latestGestureFrame<number>(timer,value=>{seen.push(value);if(value===1)queue.push(2);});
    queue.push(1);timer.tick();expect(seen).toEqual([1]);expect(timer.size()).toBe(1);timer.tick();expect(seen).toEqual([1,2]);
  });
});
