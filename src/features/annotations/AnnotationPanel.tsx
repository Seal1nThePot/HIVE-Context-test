import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TextAnnotation } from "./annotations";
function titleOf(item: TextAnnotation) {
  const text = item.original.replace(/^\s*#+\s*/, "").replace(/\s+/g, " ").trim();
  const characters = Array.from(text || "未命名标注");
  return characters.slice(0, 32).join("") + (characters.length > 32 ? "…" : "");
}
export default function AnnotationPanel({items,selected,toggle,selectAll,remove,locate,reanchor,onSend,busy,saveError,retrySave}: {
  items:TextAnnotation[];selected:Set<string>;toggle:(id:string)=>void;selectAll:()=>void;
  remove:(id:string)=>void;locate:(item:TextAnnotation)=>void;reanchor:(item:TextAnnotation)=>void;
  onSend:(ids:string[])=>void;busy:boolean;saveError:boolean;retrySave:()=>void;
}){
  const [context,setContext]=useState<{id:string;x:number;y:number}|null>(null), menu=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!context)return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node))setContext(null);};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setContext(null);};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);};
  },[context]);
  const item=items.find(value=>value.id===context?.id),chosen=items.filter(value=>selected.has(value.id));
  const run=(action:()=>void)=>{setContext(null);action();};
  function backup(){const url=URL.createObjectURL(new Blob([JSON.stringify(items,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='文本标注备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <section className="annotation-panel annotation-title-panel" aria-label="文本标注列表">
    <nav className="annotation-title-list" aria-label="标注标题">
      {!items.length&&<p className="annotation-title-empty">暂无标注</p>}
      {items.map(value=><button key={value.id} className={(selected.has(value.id)?'selected ':'')+(value.stale?'stale-title':'')}
        aria-label={`定位标注：${titleOf(value)}`} title={value.stale?'原文已变化，点击查看上次位置附近；右键可更新位置':value.original.trim()}
        onClick={event=>{if(event.ctrlKey||event.metaKey||event.shiftKey)toggle(value.id);locate(value);}}
        onContextMenu={event=>{event.preventDefault();setContext({id:value.id,x:Math.max(8,Math.min(window.innerWidth-224,event.clientX)),y:Math.max(8,Math.min(window.innerHeight-310,event.clientY))});}}
      >{titleOf(value)}</button>)}
    </nav>
    {context&&item&&createPortal(<div ref={menu} className="panel-control-menu annotation-title-menu" role="menu" aria-label="标注操作" style={{left:context.x,top:context.y}} onKeyDown={event=>{
      if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();
      const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')),index=buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();
    }}>
      <small>标注操作 · Ctrl / Shift 点击可多选</small>
      <button role="menuitem" disabled={busy||item.stale} onClick={()=>run(()=>onSend([item.id]))}>发送这条标注</button>
      <button role="menuitem" disabled={busy||!chosen.length||chosen.some(value=>value.stale)} onClick={()=>run(()=>onSend(chosen.map(value=>value.id)))}>发送所选标注（{chosen.length}）</button>
      <button role="menuitem" onClick={()=>run(selectAll)}>选择全部有效标注</button>
      {item.stale&&<button role="menuitem" onClick={()=>run(()=>reanchor(item))}>用当前选区更新位置</button>}
      <button role="menuitem" onClick={()=>run(()=>remove(item.id))}>移除此标注</button>
      {saveError&&<button role="menuitem" onClick={()=>run(retrySave)}>重试保存标注</button>}
      <button role="menuitem" onClick={()=>run(backup)}>导出标注备份</button>
    </div>,document.body)}
  </section>;
}
