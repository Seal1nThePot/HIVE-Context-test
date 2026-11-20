import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type DragEvent} from 'react';
import {createPortal} from 'react-dom';
import {usePanelDocument} from '../../shared/panelDocument';
import {ChevronDown,ChevronRight,ChevronsDownUp,ChevronsUpDown,ListTree,Sparkles} from "../../shared/icons";
import type {Heading} from '../../shared/core';
import {tocRows} from './tocModel';
import './table-of-contents.css';

export default function TableOfContents({file,items,current,onLocate,onDraft,onDragSection}:{file:string;items:Heading[];current?:number;onLocate:(from:number)=>void;onDraft?:(heading:Heading)=>void;onDragSection?:(heading:Heading,event:DragEvent<HTMLButtonElement>)=>void}){
  const [collapsed,setCollapsed]=useState<Set<string>>(new Set());
  const [zoomPercent,setZoomPercent]=useState(100);
  const listRef=useRef<HTMLElement>(null);
  const rows=tocRows(items,collapsed);
  const document=usePanelDocument(),[menu,setMenu]=useState<{heading:Heading;x:number;y:number;button:HTMLButtonElement}|null>(null),menuRef=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{menuRef.current?.querySelector('button')?.focus();},[menu]);
  useEffect(()=>{
    const list=listRef.current;
    if(!list)return;
    const zoom=(event:WheelEvent)=>{
      if(!event.ctrlKey)return;
      event.preventDefault();
      event.stopPropagation();
      const direction=Math.sign(event.deltaY);
      if(direction)setZoomPercent(current=>Math.max(90,Math.min(110,current-direction*5)));
    };
    list.addEventListener('wheel',zoom,{passive:false});
    return ()=>list.removeEventListener('wheel',zoom);
  },[]);
  useEffect(()=>{
    if(!menu)return;
    const close=()=>setMenu(null);
    const outside=(event:PointerEvent)=>{if(!menuRef.current?.contains(event.target as Node))close();};
    document.addEventListener('pointerdown',outside,true);
    document.defaultView?.addEventListener('blur',close);
    document.defaultView?.addEventListener('resize',close);
    return ()=>{document.removeEventListener('pointerdown',outside,true);document.defaultView?.removeEventListener('blur',close);document.defaultView?.removeEventListener('resize',close);};
  },[menu,document]);
  function toggle(key:string){setCollapsed(old=>{const next=new Set(old);if(next.has(key))next.delete(key);else next.add(key);return next;});}
  return <div className="table-of-contents">
    <div className="toc-document"><span title={file}>{file.split('/').at(-1)||'未打开文档'}</span><small>{items.length} 个标题</small></div>
    <div className="toc-tools"><small>正文标题</small><button type="button" aria-label="展开全部标题" title="展开全部" disabled={!items.length} onClick={()=>setCollapsed(new Set())}><ChevronsUpDown size={13}/></button><button type="button" aria-label="折叠全部标题" title="折叠全部" disabled={!items.length} onClick={()=>setCollapsed(new Set(tocRows(items,new Set()).filter(row=>row.hasChildren).map(row=>row.key)))}><ChevronsDownUp size={13}/></button></div>
    <nav ref={listRef} className="toc-list" aria-label="当前文档标题目录" style={{'--toc-zoom':zoomPercent/100} as CSSProperties}>{rows.map(({key,heading,depth,hasChildren})=><div className={'toc-row '+(current===heading.from?'current':'')} key={key} style={{paddingLeft:`calc(${6+depth*12}px * var(--ui-scale,1) * var(--toc-zoom))`}}>
      {hasChildren?<button type="button" className="toc-fold" aria-label={`${collapsed.has(key)?'展开':'折叠'}标题：${heading.title}`} aria-expanded={!collapsed.has(key)} onClick={()=>toggle(key)}>{collapsed.has(key)?<ChevronRight size={12}/>:<ChevronDown size={12}/>}</button>:<span className="toc-fold-placeholder"/>}
      <button type="button" className="toc-heading" aria-current={current===heading.from?'location':undefined} title={heading.title} draggable={!!onDragSection}
        onDragStart={event=>onDragSection?.(heading,event)}
        onContextMenu={event=>{if(!onDraft)return;event.preventDefault();event.stopPropagation();setMenu({heading,x:event.clientX,y:event.clientY,button:event.currentTarget});}}
        onKeyDown={event=>{if(!onDraft||!(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'))return;event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();setMenu({heading,x:rect.left,y:rect.bottom,button:event.currentTarget});}}
        onClick={()=>onLocate(heading.from)}><small>H{heading.level}</small><span>{heading.title||'未命名标题'}</span></button>
    </div>)}</nav>
    {menu&&createPortal(<div className="editor-context-menu toc-context-menu" role="menu" aria-label="章节操作" ref={menuRef} style={{left:Math.max(8,Math.min(menu.x,(document.defaultView?.innerWidth||0)-204)),top:Math.max(8,Math.min(menu.y,(document.defaultView?.innerHeight||0)-48))}} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setMenu(null);menu.button.focus();}else if(event.key==='Tab')setMenu(null);}}><button type="button" role="menuitem" onClick={()=>{setMenu(null);onDraft?.(menu.heading);}}><Sparkles size={15}/>添加章节到 AI</button></div>,document.body)}
    {!items.length&&<div className="toc-empty"><ListTree size={22}/><p>{file?'这份文档还没有标题':'打开一份文档后查看目录'}</p>{file&&<small>输入 # 标题、## 小标题，目录会自动更新。</small>}</div>}
  </div>;
}
