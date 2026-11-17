export const MATH_DOM_QUEUE_LIMIT=128,MATH_DOM_COMMITS_PER_TICK=2;
/** Both worker completions and cache hits pass through the same bounded DOM queue. */
export class MathCommitQueue{
  private pending=new Set<()=>void>();
  private timer:ReturnType<typeof setTimeout>|undefined;
  get size(){return this.pending.size;}
  enqueue(commit:()=>void):(()=>void)|null{
    if(this.pending.size>=MATH_DOM_QUEUE_LIMIT)return null;
    this.pending.add(commit);this.schedule();
    return ()=>{this.pending.delete(commit);if(!this.pending.size){clearTimeout(this.timer);this.timer=undefined;}};
  }
  private schedule(){if(this.pending.size&&!this.timer)this.timer=setTimeout(()=>this.flush(),16);}
  private flush(){
    this.timer=undefined;
    for(let count=0;count<MATH_DOM_COMMITS_PER_TICK&&this.pending.size;count++){
      const commit=this.pending.values().next().value!;this.pending.delete(commit);commit();
    }
    this.schedule();
  }
  dispose(){clearTimeout(this.timer);this.timer=undefined;this.pending.clear();}
}
export const mathCommits=new MathCommitQueue();
