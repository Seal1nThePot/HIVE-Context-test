import {useState} from 'react';
import {ChevronDown,ChevronRight,ChevronsDownUp,ChevronsUpDown,ListTree} from 'lucide-react';
import type {Heading} from '../../shared/core';
import {tocRows} from './tocModel';
import './table-of-contents.css';

export default function TableOfContents({file,items,current,onLocate}:{file:string;items:Heading[];current?:number;onLocate:(from:number)=>void}){
  const [collapsed,setCollapsed]=useState<Set<string>>(new Set());
  const rows=tocRows(items,collapsed);
  function toggle(key:string){setCollapsed(old=>{const next=new Set(old);if(next.has(key))next.delete(key);else next.add(key);return next;});}
  return <div className="table-of-contents">
    <div className="toc-document"><span title={file}>{file.split('/').at(-1)||'未打开文档'}</span><small>{items.length} 个标题</small></div>
    <div className="toc-tools"><small>正文标题</small><button type="button" aria-label="展开全部标题" title="展开全部" disabled={!items.length} onClick={()=>setCollapsed(new Set())}><ChevronsUpDown size={13}/></button><button type="button" aria-label="折叠全部标题" title="折叠全部" disabled={!items.length} onClick={()=>setCollapsed(new Set(tocRows(items,new Set()).filter(row=>row.hasChildren).map(row=>row.key)))}><ChevronsDownUp size={13}/></button></div>
    <nav className="toc-list" aria-label="当前文档标题目录">{rows.map(({key,heading,depth,hasChildren})=><div className={'toc-row '+(current===heading.from?'current':'')} key={key} style={{paddingLeft:`calc(${6+depth*12}px * var(--ui-scale,1))`}}>
      {hasChildren?<button type="button" className="toc-fold" aria-label={`${collapsed.has(key)?'展开':'折叠'}标题：${heading.title}`} aria-expanded={!collapsed.has(key)} onClick={()=>toggle(key)}>{collapsed.has(key)?<ChevronRight size={12}/>:<ChevronDown size={12}/>}</button>:<span className="toc-fold-placeholder"/>}
      <button type="button" className="toc-heading" aria-current={current===heading.from?'location':undefined} title={heading.title} onClick={()=>onLocate(heading.from)}><small>H{heading.level}</small><span>{heading.title||'未命名标题'}</span></button>
    </div>)}</nav>
    {!items.length&&<div className="toc-empty"><ListTree size={22}/><p>{file?'这份文档还没有标题':'打开一份文档后查看目录'}</p>{file&&<small>输入 # 标题、## 小标题，目录会自动更新。</small>}</div>}
  </div>;
}
