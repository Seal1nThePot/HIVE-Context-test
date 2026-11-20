import {useCallback,useEffect,useRef,useState} from 'react';
import {requestJson} from '../../shared/api';
import {useFileWorkspace} from '../files/WorkspaceContext';
import type {HistoryLimits, HistoryRecord, HistorySnapshot, HistoryStatus, HistorySummary} from './historyTypes';

const initial:HistorySummary={revision:0,limits:{human:100,ai:100},entries:[],snapshots:[]};

export function useHistoryJournal(){
  const {request}=useFileWorkspace();
  const [summary,setSummary]=useState(initial);
  const [error,setError]=useState('');
  const queue=useRef<Promise<unknown>>(Promise.resolve());
  const live=useRef(true);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);

  const accept=useCallback((next:HistorySummary)=>{
    if(live.current)setSummary(current=>next.revision>=current.revision?next:current);
  },[]);
  const read=useCallback(async()=>{
    await queue.current.catch(()=>{});
    try{accept(await requestJson<HistorySummary>(request,'/history'));if(live.current)setError('');}
    catch(reason){if(live.current)setError((reason as Error).message);}
  },[request,accept]);
  const mutate=useCallback((url:string,body:unknown,ignoreMissing=false)=>{
    const result=queue.current.catch(()=>{}).then(async()=>{
      try{accept(await requestJson<HistorySummary>(request,url,body));if(live.current)setError('');}
      catch(reason){
        const message=(reason as Error).message;
        if(ignoreMissing&&message==='操作历史已不存在。')return;
        if(live.current)setError(message);
        throw reason;
      }
    });
    queue.current=result;
    return result;
  },[request,accept]);
  return {summary,error,read,
    append:(entry:HistoryRecord)=>mutate('/history/entries',entry),
    saveSnapshot:(entry:HistorySnapshot)=>mutate('/history/snapshots',entry),
    setLimits:(limits:HistoryLimits)=>mutate('/history/limits',limits),
    setStatus:(id:string,status:HistoryStatus,expectedStatus:HistoryStatus,ignoreMissing=false,fileId?:string)=>mutate('/history/status',{id,status,expectedStatus,fileId},ignoreMissing),
    entry:(id:string)=>requestJson<HistoryRecord>(request,'/history/entries/'+encodeURIComponent(id)),
    snapshot:(id:string)=>requestJson<HistorySnapshot>(request,'/history/snapshots/'+encodeURIComponent(id)),
    wait:()=>queue.current.catch(()=>{}),
  };
}
