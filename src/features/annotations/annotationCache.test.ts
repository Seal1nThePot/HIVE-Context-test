import {describe,expect,it} from 'vitest';
import {pruneAnnotationCache} from './annotationCache';

const record=(text:string,overrides:Partial<{seq:number;savedSeq:number;busy:boolean;loading:boolean;error:string}>={})=>({text,seq:0,savedSeq:0,busy:false,loading:false,error:'',...overrides});

describe('annotation cache eviction',()=>{
  it('evicts oldest clean inactive records for both count and character budgets',()=>{
    const cache=new Map([['old',record('1234')],['middle',record('1234')],['new',record('1234')],['active',record('active')]]);
    pruneAnnotationCache(cache,cache.get('active'),2,5);
    expect([...cache.keys()]).toEqual(['new','active']);
  });
  it('retains active, dirty, saving, loading and failed records even above the budget, then evicts when safe',()=>{
    const active=record('active'),dirty=record('dirty',{seq:1}),busy=record('busy',{busy:true}),loading=record('loading',{loading:true}),failed=record('failed',{error:'failure'});
    const cache=new Map([['active',active],['dirty',dirty],['busy',busy],['loading',loading],['failed',failed]]);
    pruneAnnotationCache(cache,active,0,0);expect(cache.size).toBe(5);
    dirty.savedSeq=1;busy.busy=false;loading.loading=false;failed.error='';
    pruneAnnotationCache(cache,active,0,0);expect([...cache.keys()]).toEqual(['active']);
  });
});
