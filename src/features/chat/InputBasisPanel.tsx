import {usePanelDocument} from '../../shared/panelDocument';
import {REFERENCE_DRAG_TYPE,readReferenceDrag} from '../files/referenceDrag';
import {reasoningLevels} from './modelReasoning';
import {useEffect,useRef,useState} from 'react';
import {ArrowDown,ArrowUp,BookOpen,ChevronRight,History,Icon} from "../../shared/icons";
import {modeLabels,type Mode} from '../../shared/core';
import {flattenEntries,type Entry} from '../files/explorerState';
import {referenceSourceKey,type ReferenceSource} from './referenceSources';
import './input-basis.css';

export type InputBasisRequest={messages:{role:string;content:string}[];mode:Mode;node:string;scope:string;file:string;demo?:boolean;referenceDetails?:{sources?:ReferenceSource[];files?:{path:string;source:string;characters:number;truncated?:boolean}[];warnings?:string[]};reasoningEffort?:string;model?:string};
type Props={request:InputBasisRequest|null;file:string;mode:Mode;sources:ReferenceSource[];entries:Entry[];onChange:(sources:ReferenceSource[])=>void;onExternalDrop:(files:File[])=>Promise<void>;workspaceId:string};
function same(a:ReferenceSource,b:ReferenceSource){return a.path===b.path&&a.type===b.type;}
function markdownCount(entry:Entry):number{return entry.type==='file'?(/\.md$/i.test(entry.path)?1:0):(entry.children||[]).reduce((sum,child)=>sum+markdownCount(child),0);}
function reordered(items:ReferenceSource[],from:number,to:number){const next=[...items],item=next.splice(from,1)[0];next.splice(to,0,item);return next;}
export default function InputBasisPanel({request,file,mode,sources,entries,onChange,onExternalDrop,workspaceId}:Props){
  const document=usePanelDocument(),window=document.defaultView!;
  const [picker,setPicker]=useState(false),[query,setQuery]=useState(''),[preview,setPreview]=useState<{from:number;gap:number}|null>(null),[receiving,setReceiving]=useState(false);
  const list=useRef<HTMLOListElement>(null),cleanup=useRef<(()=>void)|null>(null);
  useEffect(()=>()=>cleanup.current?.(),[document]);
  const all=flattenEntries(entries).filter(entry=>entry.type==='folder'||/\.md$/i.test(entry.path));
  function add(source:ReferenceSource){if(sources.length<32&&!sources.some(item=>same(item,source)))onChange([...sources,source]);}
  function beginSort(index:number,event:React.PointerEvent<HTMLButtonElement>){
    if(event.button!==0)return;event.stopPropagation();cleanup.current?.();
    const start={x:event.clientX,y:event.clientY},pointer=event.pointerId;let started=false,gap=index;
    const clean=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',cancel);window.removeEventListener('keydown',key,true);window.removeEventListener('blur',cancel);cleanup.current=null;setPreview(null);};
    const move=(next:PointerEvent)=>{if(next.pointerId!==pointer)return;if(!started&&Math.hypot(next.clientX-start.x,next.clientY-start.y)<5)return;started=true;next.preventDefault();const rows=Array.from(list.current?.querySelectorAll<HTMLElement>('[data-reference-index]')||[]);if(!rows.length)return;const target=rows.find(row=>next.clientY<row.getBoundingClientRect().top+row.getBoundingClientRect().height/2);gap=target?Number(target.dataset.referenceIndex):rows.length;setPreview({from:index,gap});};
    const cancel=()=>clean();const key=(next:KeyboardEvent)=>{if(next.key==='Escape'){next.preventDefault();next.stopPropagation();cancel();}};
    const finish=(next:PointerEvent)=>{if(next.pointerId!==pointer)return;clean();const to=gap>index?gap-1:gap;if(started&&to!==index)onChange(reordered(sources,index,to));};
    window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',cancel);window.addEventListener('keydown',key,true);window.addEventListener('blur',cancel);cleanup.current=cancel;
  }
  return <div className={'input-basis-content reference-drop-target'+(receiving?' reference-drag-active':'')} data-reference-drop="basis" data-reference-workspace={workspaceId}
    onDragOver={event=>{if(Array.from(event.dataTransfer.types).some(type=>type===REFERENCE_DRAG_TYPE||type==='Files')){event.preventDefault();event.dataTransfer.dropEffect='copy';setReceiving(true);}}}
    onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setReceiving(false);}}
    onDrop={event=>{
      setReceiving(false);
      const types=Array.from(event.dataTransfer.types);
      if(!types.includes(REFERENCE_DRAG_TYPE)&&!types.includes('Files'))return;
      event.preventDefault();event.stopPropagation();
      if(types.includes(REFERENCE_DRAG_TYPE)){
        const source=readReferenceDrag(event.dataTransfer.getData(REFERENCE_DRAG_TYPE),workspaceId);
        if(source&&all.some(entry=>entry.path===source.path&&entry.type===source.type))add(source);
      }else void onExternalDrop([...event.dataTransfer.files]);
    }}>
    <section className="reference-library" aria-label="参考资料">
    <div className="reference-heading"><strong><BookOpen size={16}/>参考资料</strong><button type="button" className="reference-add" aria-label="添加参考资料" title="添加参考资料" aria-expanded={picker} onClick={()=>setPicker(!picker)}><Icon name="basis.addReference" size={16}/><span>添加</span></button></div>
    {!!sources.length&&<ol ref={list} className="reference-list">{sources.map((source,index)=>{const entry=all.find(item=>item.path===source.path&&item.type===source.type),folder=source.type==='folder';return <li key={referenceSourceKey(source)} data-reference-index={index} className={preview&&preview.gap!==preview.from&&preview.gap!==preview.from+1?(preview.gap===index?'reference-before':preview.gap===sources.length&&index===sources.length-1?'reference-after':''):''}>
      <button type="button" className="reference-grip" title="拖动调整顺序" aria-label={`拖动调整 ${source.path} 的顺序`} onPointerDown={event=>beginSort(index,event)}><Icon name="basis.reorderReference" size={14}/></button><span className="reference-number">{index+1}</span><Icon name={source.type==='attachment'?'basis.attachment':folder?'basis.referenceFolder':'basis.referenceFile'} size={15}/><span className="reference-name" title={source.path}>{source.path}<small>{source.type==='attachment'?'外部附件':folder?(entry?`文件夹 · ${markdownCount(entry)} 个 Markdown`:'文件夹 · 未找到'):(entry?'文件':'文件 · 未找到')}</small></span>
      <button type="button" aria-label={`上移 ${source.path}`} disabled={index===0} onClick={()=>onChange(reordered(sources,index,index-1))}><ArrowUp size={13}/></button><button type="button" aria-label={`下移 ${source.path}`} disabled={index===sources.length-1} onClick={()=>onChange(reordered(sources,index,index+1))}><ArrowDown size={13}/></button><button type="button" aria-label={`移除 ${source.path}`} onClick={()=>onChange(sources.filter((_,i)=>i!==index))}><Icon name="basis.removeReference" size={13}/></button>
    </li>;})}</ol>}
    {!sources.length&&!picker&&<p className="reference-empty">暂无参考资料</p>}
    {picker&&<div className="reference-picker"><label className="reference-picker-search"><Icon name="basis.search" size={13}/><input autoFocus aria-label="搜索参考资料" placeholder="搜索当前空间的文件或文件夹" value={query} onChange={event=>setQuery(event.target.value)}/></label><div className="reference-picker-list">{all.filter(entry=>entry.path.toLowerCase().includes(query.toLowerCase())).map(entry=>{const selected=sources.some(item=>same(item,entry));return <button type="button" key={entry.type+':'+entry.path} title={entry.path} disabled={selected||sources.length>=32} onClick={()=>add({path:entry.path,type:entry.type})}><Icon name={entry.type==='folder'?'basis.referenceFolder':'basis.referenceFile'} size={14}/><span>{entry.path}</span><small>{selected?'已添加':entry.type==='folder'?`${markdownCount(entry)} 个 Markdown`:'添加'}</small></button>;})}{!all.some(entry=>entry.path.toLowerCase().includes(query.toLowerCase()))&&<p>没有匹配的文件或文件夹。</p>}</div>{sources.length>=32&&<small>已达到 32 项上限。</small>}</div>}
    </section>
    <details className="reference-snapshot"><summary><History size={15}/><span>上一次请求快照</span><ChevronRight size={14} className="reference-snapshot-chevron"/></summary><div className="context-summary"><span>{request?.file||file||'未打开文档'}</span><span>{modeLabels[request?.mode||mode]}</span>{request&&<span>{request.scope}</span>}{request?.model&&<span>{request.model}</span>}{request?.reasoningEffort&&<span>推理：{reasoningLevels.find(level=>level.value===request.reasoningEffort)?.label||request.reasoningEffort}</span>}</div>
      {request?<><p className="basis-note">以下是上一次发起请求时的实际消息快照，之后的手改在下次请求中更新。{request.demo&&'演示模式没有发送网络模型请求。'}</p>{request.referenceDetails?.files?.map((item,index)=><p className="basis-note" key={index}>{item.path} · {item.characters.toLocaleString()} 字符{item.truncated?' · 已截断':''}</p>)}{request.referenceDetails?.warnings?.map((warning,index)=><p className="basis-note" key={index}>{warning}</p>)}<div className="context-content">{request.messages.map((message,index)=><details key={index}><summary>{message.role==='system'?'本轮规则':message.role==='user'?'用户要求 / 文档依据':'会话回复'}<small>{message.content.length.toLocaleString()} 字符</small></summary><pre>{message.content}</pre></details>)}</div></>:<p className="basis-note">尚未发起请求。下次会读取这段对话，并按当前任务使用正文、选区和参考资料。</p>}
    </details>
  </div>;
}
