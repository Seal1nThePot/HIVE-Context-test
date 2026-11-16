import {useEffect,useState} from 'react';
import {parseViewCollection,type ViewPreset,type ViewSnapshot} from './viewPresets';
import type {Mode} from '../../shared/core';

export function useViewPresets(workspaceId:string){
  const key='hive.views.v1:'+workspaceId;
  const [views,setViews]=useState<ViewPreset[]>([]),[error,setError]=useState('');
  useEffect(()=>{
    const read=()=>{try{setViews(parseViewCollection(localStorage.getItem(key)).views);setError('');}catch(error){setError((error as Error).message);}};
    read();const changed=(event:StorageEvent)=>{if(event.key===key)read();};window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed);
  },[key]);
  function commit(change:(views:ViewPreset[])=>ViewPreset[]){
    let previous:ViewPreset[];
    try{previous=parseViewCollection(localStorage.getItem(key)).views;}
    catch(error){setError((error as Error).message);throw new Error('未能读取视图：'+(error as Error).message);}
    // Name or snapshot validation failures belong to the current action, not the whole collection.
    const next=change(previous),encoded=JSON.stringify({version:1,views:next}),validated=parseViewCollection(encoded);
    try{localStorage.setItem(key,JSON.stringify(validated));setViews(validated.views);setError('');}
    catch(error){setError((error as Error).message);throw new Error('未能保存视图：'+(error as Error).message);}
  }

  return {views,error,
    save:(name:string,mode:Mode,snapshot:ViewSnapshot,existingId?:string)=>{
      const id=existingId||crypto.randomUUID(),trimmed=name.trim();if(!trimmed)throw new Error('请填写视图名称。');
      commit(views=>{
        if(views.some(item=>item.mode===mode&&item.name===trimmed&&item.id!==id))throw new Error('当前模式已有同名视图。');
        if(existingId&&!views.some(item=>item.id===existingId&&item.mode===mode))throw new Error('这个视图已被移除，请另存为新视图。');
        const next:ViewPreset={...structuredClone(snapshot),id,name:trimmed,mode,updatedAt:new Date().toISOString()};
        return existingId?views.map(item=>item.id===id?next:item):[...views,next];
      });return id;
    },
    rename:(id:string,name:string)=>commit(views=>{
      const current=views.find(item=>item.id===id),trimmed=name.trim();if(!current)throw new Error('这个视图已被移除。');if(!trimmed)throw new Error('请填写视图名称。');
      if(views.some(item=>item.mode===current.mode&&item.id!==id&&item.name===trimmed))throw new Error('当前模式已有同名视图。');
      return views.map(item=>item.id===id?{...item,name:trimmed,updatedAt:new Date().toISOString()}:item);
    }),
    remove:(id:string)=>commit(views=>views.filter(item=>item.id!==id)),
  };
}
