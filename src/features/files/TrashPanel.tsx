import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {FileText,Folder,RotateCcw,Search} from 'lucide-react';
import {useFileWorkspace} from './WorkspaceContext';
import './trash-panel.css';

export type TrashRecord={id:string;path:string;type:'file'|'folder';deletedAt:string;missing?:boolean};
export type TrashPreview={token:string;days:number;cutoff:string;expiresAt:string;items:TrashRecord[];count:number};
export type TrashPurgeResult={deletedIds:string[];failed:{id:string;path:string;error:string;dataDeleted?:boolean;partialDataDeleted?:boolean}[]};
type Props={open:boolean;refreshKey:number;onRestore:(id:string)=>Promise<unknown>;onChanged:()=>void};
const nameOf=(path:string)=>path.replace(/[\\/]+$/,'').split(/[\\/]/).pop()||path;
const dateOf=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?value:date.toLocaleString();};

export default function TrashPanel({open,refreshKey,onRestore,onChanged}:Props){
  const {info,request}=useFileWorkspace();
  const [items,setItems]=useState<TrashRecord[]>([]),[query,setQuery]=useState(''),[sort,setSort]=useState('newest'),[days,setDays]=useState(30);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[preview,setPreview]=useState<TrashPreview|null>(null);
  const dialog=useRef<HTMLDialogElement>(null),generation=useRef(0),controllers=useRef(new Set<AbortController>()),listSequence=useRef(0),busyRef=useRef(false);
  const abortAll=useCallback(()=>{generation.current++;listSequence.current++;controllers.current.forEach(controller=>controller.abort());controllers.current.clear();busyRef.current=false;},[]);
  const load=useCallback(async()=>{
    if(!open)return;
    const epoch=generation.current,seq=++listSequence.current,controller=new AbortController();controllers.current.add(controller);setLoading(true);
    try{const response=await request('/api/explorer/trash',{signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.error||'无法读取回收站');if(epoch===generation.current&&seq===listSequence.current)setItems(data);}
    catch(e){if(epoch===generation.current&&seq===listSequence.current&&(e as Error).name!=='AbortError')setError((e as Error).message);}
    finally{controllers.current.delete(controller);if(epoch===generation.current&&seq===listSequence.current)setLoading(false);}
  },[open,request]);
  useEffect(()=>{abortAll();setItems([]);setPreview(null);setError('');setNotice('');setBusy(false);setLoading(false);if(open)void load();return abortAll;},[open,info.id,request,abortAll]);
  useEffect(()=>{if(open)void load();},[refreshKey]);
  useEffect(()=>{if(!open)return;const focus=()=>void load();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[open,load]);
  useEffect(()=>{if(preview&&dialog.current&&!dialog.current.open)dialog.current.showModal();},[preview]);
  const visible=useMemo(()=>items.filter(item=>item.path.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>sort==='name'?nameOf(a.path).localeCompare(nameOf(b.path),'zh-CN'):sort==='oldest'?a.deletedAt.localeCompare(b.deletedAt):b.deletedAt.localeCompare(a.deletedAt)),[items,query,sort]);
  async function fetchPreview(){
    if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');setNotice('');const epoch=generation.current,controller=new AbortController();controllers.current.add(controller);
    try{const response=await request('/api/explorer/trash/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({days}),signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.error||'无法预览清理');if(epoch!==generation.current)return;if(!data.count){setNotice(`没有 ${days} 天以前可清理的条目。`);return;}setPreview(data);}
    catch(e){if(epoch===generation.current&&(e as Error).name!=='AbortError')setError((e as Error).message);}
    finally{controllers.current.delete(controller);if(epoch===generation.current){busyRef.current=false;setBusy(false);}}
  }
  async function purge(){
    if(busyRef.current||!preview)return;busyRef.current=true;setBusy(true);setError('');const epoch=generation.current,controller=new AbortController();controllers.current.add(controller);
    try{const response=await request('/api/explorer/trash/purge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:preview.token}),signal:controller.signal});const data=await response.json();if(epoch!==generation.current)return;if(!response.ok){if(response.status===409){setPreview(null);throw new Error('回收站内容已变化或预览已过期，请重新预览后再清理。');}throw new Error(data.error||'清理失败');}const result=data as TrashPurgeResult;setPreview(null);setNotice(`已永久删除 ${result.deletedIds.length} 项。${result.failed.length?` 另有 ${result.failed.length} 项未完全处理：${result.failed.map(item=>`${item.path}（${item.dataDeleted?'内容已永久删除，记录待清理':item.partialDataDeleted?'部分内容已删除，余项保留':'未完成'}：${item.error}）`).join('；')}`:''}`);onChanged();void load();}
    catch(e){if(epoch===generation.current&&(e as Error).name!=='AbortError')setError((e as Error).message);}
    finally{controllers.current.delete(controller);if(epoch===generation.current){busyRef.current=false;setBusy(false);}}
  }
  async function restore(item:TrashRecord){if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');setNotice('');const epoch=generation.current;try{await onRestore(item.id);if(epoch!==generation.current)return;setNotice(`已恢复 ${nameOf(item.path)}。`);onChanged();void load();}catch(e){if(epoch===generation.current)setError((e as Error).message);}finally{if(epoch===generation.current){busyRef.current=false;setBusy(false);}}}
  if(!open)return null;
  return <section className="trash-panel" aria-label="回收站" aria-busy={busy||loading}>
    <div className="trash-panel-search"><Search size={13}/><input aria-label="筛选回收站" placeholder="查找回收站…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
    <div className="trash-panel-tools"><label>清理 <select aria-label="清理时间范围" value={days} disabled={busy} onChange={e=>setDays(Number(e.target.value))}>{[7,15,30,90].map(n=><option key={n} value={n}>{n} 天以前</option>)}</select></label><button type="button" disabled={busy} onClick={()=>void fetchPreview()}>清理</button></div>
    <div className="trash-panel-sort"><span>回收站</span><select aria-label="回收站排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">删除时间：新到旧</option><option value="oldest">删除时间：旧到新</option><option value="name">名称</option></select></div>
    {error&&<p className="trash-panel-message" role="alert">{error}</p>}{notice&&<p className="trash-panel-message" role="status">{notice}</p>}
    <div className="trash-panel-list">{visible.map(item=><div className="trash-panel-row" key={item.id} title={item.path}>{item.type==='folder'?<Folder size={15}/>:<FileText size={15}/>}<span className="trash-panel-name">{nameOf(item.path)}</span><time title={dateOf(item.deletedAt)}>{new Date(item.deletedAt).toLocaleDateString()}</time><button type="button" aria-label={`恢复 ${nameOf(item.path)}`} title={item.missing?'原内容已不存在，无法恢复':'恢复'} disabled={busy||item.missing} onClick={()=>void restore(item)}><RotateCcw size={13}/></button></div>)}{!visible.length&&!loading&&<p className="trash-panel-empty">{query?'没有匹配的条目。':'回收站为空。'}</p>}{loading&&!items.length&&<p className="trash-panel-empty">正在读取…</p>}</div>
    {preview&&createPortal(<dialog ref={dialog} className="trash-confirm" role="alertdialog" aria-labelledby="trash-confirm-title" onCancel={e=>{e.preventDefault();if(!busy)setPreview(null);}}><h2 id="trash-confirm-title">永久删除这些条目？</h2><p>将永久删除 {preview.days} 天以前的 {preview.count} 项（截止时间：{dateOf(preview.cutoff)}）。删除后无法恢复；文件夹及其中所有内容都会被删除。</p><ul>{preview.items.map(item=><li key={item.id} title={item.path}>{nameOf(item.path)}{item.type==='folder'?' /':''}</li>)}</ul>{error&&<p role="alert">{error}</p>}<div className="trash-confirm-actions"><button type="button" disabled={busy} onClick={()=>setPreview(null)}>取消</button><button type="button" className="trash-confirm-danger" disabled={busy} onClick={()=>void purge()}>永久删除 {preview.count} 项</button></div></dialog>,document.body)}
  </section>;
}
