import {usePanelDocument} from '../../shared/panelDocument';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowDownAZ,ArrowDownWideNarrow,ArrowUpNarrowWide,Eraser,FileText,Folder,RotateCcw,Search,Trash2} from 'lucide-react';
import {useFileWorkspace} from './WorkspaceContext';
import './trash-panel.css';

export type TrashRecord={id:string;path:string;type:'file'|'folder';deletedAt:string;missing?:boolean};
export type TrashPreview={token:string;days:number;cutoff:string;expiresAt:string;items:TrashRecord[];count:number};
type Failure={id:string;path:string;error:string;dataDeleted?:boolean;partialDataDeleted?:boolean};
export type TrashDeleteResult={deletedIds:string[];failed:Failure[]};
export type TrashPurgeResult=TrashDeleteResult;
type Props={open:boolean;refreshKey:number;onRestore:(id:string)=>Promise<unknown>;onChanged:()=>void};

const SORTS=[
  {id:'newest',label:'删除时间（新→旧）',Icon:ArrowDownWideNarrow},
  {id:'oldest',label:'删除时间（旧→新）',Icon:ArrowUpNarrowWide},
  {id:'name',label:'名称（A→Z）',Icon:ArrowDownAZ}
] as const;
type SortId=(typeof SORTS)[number]['id'];
const DAYS=[0,7,15,30,90] as const;
const RELATIVE=new Intl.RelativeTimeFormat('zh-CN',{numeric:'auto'});
const UNITS:[Intl.RelativeTimeFormatUnit,number][]=[['year',31536000000],['month',2592000000],['day',86400000],['hour',3600000],['minute',60000]];
const nameOf=(path:string)=>path.replace(/[\\/]+$/,'').split(/[\\/]/).pop()||path;
const parentOf=(path:string)=>{const clean=path.replace(/[\\/]+$/,'');const index=Math.max(clean.lastIndexOf('/'),clean.lastIndexOf('\\'));return index<=0?'':clean.slice(0,index);};
const dateOf=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?value:date.toLocaleString();};
const relativeTime=(value:string)=>{
  const time=Date.parse(value);if(!Number.isFinite(time))return value;
  const diff=time-Date.now();
  for(const [unit,ms] of UNITS)if(Math.abs(diff)>=ms)return RELATIVE.format(Math.round(diff/ms),unit);
  return '刚刚';
};
const dayLabel=(days:number)=>days===0?'全部':days+' 天';
const failureText=(item:Failure)=>item.dataDeleted?'内容已永久删除，记录待清理':item.partialDataDeleted?'部分内容已删除，余项保留':'未完成';

export default function TrashPanel({open,refreshKey,onRestore,onChanged}:Props){
  const {info,request}=useFileWorkspace(),document=usePanelDocument(),window=document.defaultView!;
  const [items,setItems]=useState<TrashRecord[]>([]),[query,setQuery]=useState(''),[sort,setSort]=useState<SortId>('newest'),[days,setDays]=useState(30);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [confirm,setConfirm]=useState<{preview:TrashPreview}|{item:TrashRecord}|null>(null);
  const dialog=useRef<HTMLDialogElement>(null),generation=useRef(0),controllers=useRef(new Set<AbortController>()),listSequence=useRef(0),busyRef=useRef(false);
  const abortAll=useCallback(()=>{generation.current++;listSequence.current++;controllers.current.forEach(controller=>controller.abort());controllers.current.clear();busyRef.current=false;},[]);
  const load=useCallback(async()=>{
    if(!open)return;
    const epoch=generation.current,seq=++listSequence.current,controller=new AbortController();controllers.current.add(controller);setLoading(true);
    try{const response=await request('/api/explorer/trash',{signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.error||'无法读取回收站');if(epoch===generation.current&&seq===listSequence.current)setItems(data);}
    catch(e){if(epoch===generation.current&&seq===listSequence.current&&(e as Error).name!=='AbortError')setError((e as Error).message);}
    finally{controllers.current.delete(controller);if(epoch===generation.current&&seq===listSequence.current)setLoading(false);}
  },[open,request]);
  useEffect(()=>{abortAll();setItems([]);setConfirm(null);setError('');setNotice('');setBusy(false);setLoading(false);if(open)void load();return abortAll;},[open,info.id,request,abortAll]);
  useEffect(()=>{if(open)void load();},[refreshKey]);
  useEffect(()=>{if(!open)return;const focus=()=>void load();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[open,load]);
  useEffect(()=>{const node=dialog.current;if(!node)return;if(confirm&&!node.open)node.showModal();if(!confirm&&node.open)node.close();},[confirm]);
  const sortOption=SORTS.find(option=>option.id===sort)!;
  const sortLabel=sortOption.label;
  const cycleSort=()=>setSort(current=>SORTS[(SORTS.findIndex(option=>option.id===current)+1)%SORTS.length].id);
  const visible=useMemo(()=>items.filter(item=>item.path.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>sort==='name'?nameOf(a.path).localeCompare(nameOf(b.path),'zh-CN'):sort==='oldest'?a.deletedAt.localeCompare(b.deletedAt):b.deletedAt.localeCompare(a.deletedAt)),[items,query,sort]);
  async function fetchPreview(){
    if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');setNotice('');const epoch=generation.current,controller=new AbortController();controllers.current.add(controller);
    try{const response=await request('/api/explorer/trash/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({days}),signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.error||'无法预览清理');if(epoch!==generation.current)return;if(!data.count){setNotice(days===0?'回收站没有可清理的条目。':'没有 '+days+' 天以前可清理的条目。');return;}setConfirm({preview:data as TrashPreview});}
    catch(e){if(epoch===generation.current&&(e as Error).name!=='AbortError')setError((e as Error).message);}
    finally{controllers.current.delete(controller);if(epoch===generation.current){busyRef.current=false;setBusy(false);}}
  }
  async function purge(preview:TrashPreview){
    if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');const epoch=generation.current,controller=new AbortController();controllers.current.add(controller);
    try{const response=await request('/api/explorer/trash/purge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:preview.token}),signal:controller.signal});const data=await response.json();if(epoch!==generation.current)return;if(!response.ok){if(response.status===409){setConfirm(null);throw new Error('回收站内容已变化或预览已过期，请重新预览后再清理。');}throw new Error(data.error||'清理失败');}const result=data as TrashPurgeResult;const removed=new Set(result.deletedIds);listSequence.current++;setItems(items=>items.filter(item=>!removed.has(item.id)));setConfirm(null);setNotice('已永久删除 '+result.deletedIds.length+' 项。'+(result.failed.length?' 另有 '+result.failed.length+' 项未完全处理：'+result.failed.map(item=>item.path+'（'+failureText(item)+'：'+item.error+'）').join('；'):''));onChanged();await load();}
    catch(e){if(epoch===generation.current&&(e as Error).name!=='AbortError')setError((e as Error).message);}
    finally{controllers.current.delete(controller);if(epoch===generation.current){busyRef.current=false;setBusy(false);}}
  }
  async function remove(item:TrashRecord){
    if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');setNotice('');const epoch=generation.current,controller=new AbortController();controllers.current.add(controller);
    try{const response=await request('/api/explorer/trash/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:[item.id]}),signal:controller.signal});const data=await response.json();if(epoch!==generation.current)return;if(!response.ok){if(response.status===404){listSequence.current++;setItems(items=>items.filter(entry=>entry.id!==item.id));setNotice('该条目已不在回收站中。');onChanged();await load();return;}throw new Error(data.error||'无法删除该项目');}const result=data as TrashDeleteResult;const removed=new Set(result.deletedIds);listSequence.current++;setItems(items=>items.filter(entry=>!removed.has(entry.id)));setConfirm(null);setNotice(result.failed.length?'未能完全删除 '+nameOf(item.path)+'：'+result.failed.map(entry=>entry.error).join('；'):'已永久删除 '+nameOf(item.path)+'。');onChanged();await load();}
    catch(e){if(epoch===generation.current&&(e as Error).name!=='AbortError'){setError((e as Error).message);setConfirm(null);}}
    finally{controllers.current.delete(controller);if(epoch===generation.current){busyRef.current=false;setBusy(false);}}
  }
  async function restore(item:TrashRecord){if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');setNotice('');const epoch=generation.current;try{await onRestore(item.id);if(epoch!==generation.current)return;setNotice('已恢复 '+nameOf(item.path)+'。');onChanged();await load();}catch(e){if(epoch===generation.current)setError((e as Error).message);}finally{if(epoch===generation.current){busyRef.current=false;setBusy(false);}}}
  if(!open)return null;
  const preview=confirm&&'preview' in confirm?confirm.preview:null;
  const target=confirm&&'item' in confirm?confirm.item:null;
  const purgeLabel=days===0?'清理回收站中的全部条目':'清理 '+days+' 天以前的条目';
  const SortIcon=sortOption.Icon;
  return <section className="trash-panel" aria-label="回收站" aria-busy={busy||loading}>
    <div className="trash-panel-search"><Search size={13}/><input aria-label="筛选回收站" placeholder="查找回收站…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
    <div className="trash-panel-toolbar">
      <label className="trash-panel-period" title={purgeLabel}><span>清理</span><select aria-label="清理期限" value={days} disabled={busy||!items.length} onChange={e=>setDays(Number(e.target.value))}>{DAYS.map(n=><option key={n} value={n}>{dayLabel(n)}</option>)}</select></label>
      <button type="button" className="trash-panel-tool" aria-label={'排序：'+sortLabel+'，点击切换'} title={'排序：'+sortLabel} disabled={busy} onClick={cycleSort}><SortIcon size={13}/></button>
      <button type="button" className="trash-panel-tool" aria-label={purgeLabel} title={purgeLabel} disabled={busy||!items.length} onClick={()=>void fetchPreview()}><Eraser size={13}/></button>
    </div>
    {error&&<p className="trash-panel-message" role="alert">{error}</p>}{notice&&<p className="trash-panel-message" role="status">{notice}</p>}
    <div className="trash-panel-list">
      {visible.map(item=><div className="trash-panel-row" key={item.id} title={item.path}>
        {item.type==='folder'?<Folder size={15} className="trash-panel-kind"/>:<FileText size={15} className="trash-panel-kind"/>}
        <span className="trash-panel-text"><span className="trash-panel-name">{nameOf(item.path)}</span><span className="trash-panel-meta"><span className="trash-panel-path">{parentOf(item.path)||'根目录'}</span><time dateTime={item.deletedAt} title={dateOf(item.deletedAt)}>{relativeTime(item.deletedAt)}</time></span></span>
        <span className="trash-panel-actions">
          <button type="button" aria-label={'恢复 '+nameOf(item.path)} title={item.missing?'原内容已不存在，无法恢复':'恢复'} disabled={busy||item.missing} onClick={()=>void restore(item)}><RotateCcw size={13}/></button>
          <button type="button" aria-label={'永久删除 '+nameOf(item.path)} title="永久删除" disabled={busy} onClick={()=>{setError('');setConfirm({item});}}><Trash2 size={13}/></button>
        </span>
      </div>)}
      {!visible.length&&!loading&&<div className="trash-panel-empty"><Trash2 size={28} aria-hidden="true"/><p className="trash-panel-empty-title">{query?'没有匹配的条目':'回收站为空'}</p><p className="trash-panel-empty-note">{query?'换个关键词试试':'删除的项目会保留 30 天'}</p></div>}
      {loading&&!items.length&&<p className="trash-panel-empty-note">正在读取…</p>}
    </div>
    {confirm&&createPortal(<dialog ref={dialog} className="trash-confirm" role="alertdialog" aria-labelledby="trash-confirm-title" onCancel={e=>{e.preventDefault();if(!busy)setConfirm(null);}}>
      <h2 id="trash-confirm-title">{preview?'永久删除这些条目？':'永久删除这个项目？'}</h2>
      {preview?<>
        <p>将永久删除{preview.days===0?'全部':' '+preview.days+' 天以前的'} {preview.count} 项（截止时间：{dateOf(preview.cutoff)}）。删除后无法恢复；文件夹及其中所有内容都会被删除。</p>
        <ul>{preview.items.map(item=><li key={item.id} title={item.path}>{nameOf(item.path)}{item.type==='folder'?' /':''}</li>)}</ul>
      </>:<p>将永久删除「{target?nameOf(target.path):''}」{target?.type==='folder'?'及其中所有内容':''}，删除后无法恢复。原位置：{target?(parentOf(target.path)||'根目录'):''}</p>}
      {error&&<p role="alert">{error}</p>}
      <div className="trash-confirm-actions">
        <button type="button" disabled={busy} onClick={()=>setConfirm(null)}>取消</button>
        <button type="button" className="trash-confirm-danger" disabled={busy} onClick={()=>{if(preview)void purge(preview);else if(target)void remove(target);}}>{preview?'永久删除 '+preview.count+' 项':'永久删除'}</button>
      </div>
    </dialog>,document.body)}
  </section>;
}
