import type {MathResult} from './mathRender';
import {MAX_MATH_SOURCE} from './mathSyntax';

export const MATH_QUEUE_LIMIT=64,MATH_SUBSCRIBER_LIMIT=256,MATH_CACHE_ENTRIES=128,MATH_CACHE_CHARACTERS=524288;
type Listener={active:boolean;callback:(result:MathResult)=>void};
type Job={id:number;key:string;source:string;displayMode:boolean;listeners:Set<Listener>};
export type MathWorker={onmessage:((event:MessageEvent<MathResult&{id:number}>)=>void)|null;onerror:((event:Event)=>void)|null;postMessage:(message:{id:number;source:string;displayMode:boolean})=>void;terminate:()=>void};
const unavailable=(error:string):MathResult=>({error});

/** No worker, source strings, timers or KaTeX import are created until a widget mounts. */
export class MathRenderQueue{
  private worker:MathWorker|null=null;
  private active:Job|null=null;
  private pending=new Map<string,Job>();
  private cache=new Map<string,{result:MathResult;size:number}>();
  private cacheSize=0;
  private subscribers=0;
  private sequence=0;
  private startTimer:ReturnType<typeof setTimeout>|undefined;
  private deadline:ReturnType<typeof setTimeout>|undefined;
  private idleTimer:ReturnType<typeof setTimeout>|undefined;
  private deliveryTimers=new Set<ReturnType<typeof setTimeout>>();
  constructor(private createWorker:()=>MathWorker=()=>new Worker(new URL('./mathRender.worker.ts',import.meta.url),{type:'module'}) as unknown as MathWorker){}
  get diagnostics(){return {queued:this.pending.size,active:!!this.active,subscribers:this.subscribers,cached:this.cache.size,cacheCharacters:this.cacheSize};}
  request(source:string,displayMode:boolean,callback:(result:MathResult)=>void){
    const key=(displayMode?'1':'0')+source,cached=this.cache.get(key);
    if(cached){this.cache.delete(key);this.cache.set(key,cached);return this.deliver(callback,cached.result);}
    if(source.length>MAX_MATH_SOURCE)return this.deliver(callback,unavailable('公式超过 4096 字符，显示源码'));
    let job=this.active?.key===key?this.active:this.pending.get(key);
    if(this.subscribers>=MATH_SUBSCRIBER_LIMIT||!job&&this.pending.size>=MATH_QUEUE_LIMIT)return this.deliver(callback,unavailable('视区公式超过排队预算，显示源码；移出视区后可重试'));
    if(!job){job={id:++this.sequence,key,source,displayMode,listeners:new Set()};this.pending.set(key,job);}
    const listener={active:true,callback};job.listeners.add(listener);this.subscribers++;this.schedule();
    return ()=>{
      if(!listener.active)return;listener.active=false;this.subscribers--;job!.listeners.delete(listener);
      if(!job!.listeners.size){
        this.pending.delete(key);
        if(this.active===job){this.stopWorker();this.active=null;this.schedule();}
      }
    };
  }
  private deliver(callback:(result:MathResult)=>void,result:MathResult){
    const timer=setTimeout(()=>{this.deliveryTimers.delete(timer);callback(result);},0);this.deliveryTimers.add(timer);
    return ()=>{clearTimeout(timer);this.deliveryTimers.delete(timer);};
  }
  private stopWorker(){clearTimeout(this.deadline);this.deadline=undefined;this.worker?.terminate();this.worker=null;}
  private schedule(){
    clearTimeout(this.idleTimer);this.idleTimer=undefined;
    if(!this.active&&this.pending.size&&!this.startTimer)this.startTimer=setTimeout(()=>this.start(),0);
    else if(!this.active&&!this.pending.size&&this.worker)this.idleTimer=setTimeout(()=>this.stopWorker(),10000);
  }
  private start(){
    this.startTimer=undefined;if(this.active||!this.pending.size)return;
    const job=this.pending.values().next().value!;this.pending.delete(job.key);this.active=job;
    const cold=!this.worker;
    try{
      if(!this.worker){
        const worker=this.createWorker();this.worker=worker;
        worker.onmessage=event=>{
          if(this.worker!==worker||event.data.id!==this.active?.id)return;
          const data=event.data;
          this.finish(typeof data.html==='string'&&data.html.length<=131072?{html:data.html}:unavailable(typeof data.error==='string'?data.error:'公式显示失败，显示源码'));
        };
        worker.onerror=()=>{if(this.worker!==worker)return;this.stopWorker();this.finish(unavailable('公式渲染器不可用，显示源码'),false);};
      }
      this.deadline=setTimeout(()=>{this.stopWorker();this.finish(unavailable('公式计算超时，显示源码'),false);},cold?1500:250);
      this.worker.postMessage({id:job.id,source:job.source,displayMode:job.displayMode});
    }catch{this.stopWorker();this.finish(unavailable('公式渲染器不可用，显示源码'),false);}
  }
  private finish(result:MathResult,cacheable=true){
    clearTimeout(this.deadline);this.deadline=undefined;
    const job=this.active;this.active=null;if(!job)return;
    if(job.listeners.size){
      const size=job.key.length+(result.html?.length||result.error?.length||0);
      if(cacheable&&size<=MATH_CACHE_CHARACTERS){
        this.cache.set(job.key,{result,size});this.cacheSize+=size;
        while(this.cache.size>MATH_CACHE_ENTRIES||this.cacheSize>MATH_CACHE_CHARACTERS){const key=this.cache.keys().next().value!;this.cacheSize-=this.cache.get(key)!.size;this.cache.delete(key);}
      }
      const listeners=[...job.listeners];job.listeners.clear();
      for(const listener of listeners){if(listener.active){listener.active=false;this.subscribers--;listener.callback(result);}}
    }
    this.schedule();
  }
  dispose(){
    clearTimeout(this.startTimer);clearTimeout(this.idleTimer);this.stopWorker();
    for(const timer of this.deliveryTimers)clearTimeout(timer);this.deliveryTimers.clear();
    this.startTimer=undefined;this.idleTimer=undefined;
    if(this.active)for(const listener of this.active.listeners)listener.active=false;
    for(const job of this.pending.values())for(const listener of job.listeners)listener.active=false;
    this.active=null;this.pending.clear();this.cache.clear();this.cacheSize=0;this.subscribers=0;
  }
}
export const mathRenderer=new MathRenderQueue();
