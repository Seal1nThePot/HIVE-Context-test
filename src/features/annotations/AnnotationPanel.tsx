import {usePanelDocument} from '../../shared/panelDocument';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {GripVertical} from "../../shared/icons";
import { createPortal } from "react-dom";
import type { TextAnnotation } from "./annotations";
function titleOf(item: TextAnnotation) {
  const text = item.original.replace(/^\s*#+\s*/, "").replace(/\s+/g, " ").trim();
  const characters = Array.from(text || "未命名标注");
  return characters.slice(0, 32).join("") + (characters.length > 32 ? "…" : "");
}
export default function AnnotationPanel({items,selected,toggle,selectAll,remove,reorder,locate,reanchor,onSend,busy,saveError,retrySave,focusRequest}: {
  items:TextAnnotation[];selected:Set<string>;toggle:(id:string)=>void;selectAll:()=>void;
  remove:(id:string)=>void;reorder:(id:string,before:string|null)=>void;locate:(item:TextAnnotation)=>void;reanchor:(item:TextAnnotation)=>void;
  onSend:(ids:string[])=>void;busy:boolean;saveError:boolean;retrySave:()=>void;
  focusRequest?:{id:string;nonce:number}|null;
}){
  const document=usePanelDocument(),window=document.defaultView!;
  const [context,setContext]=useState<{id:string;x:number;y:number}|null>(null), menu=useRef<HTMLDivElement>(null);
  const list=useRef<HTMLOListElement>(null),cleanup=useRef<(()=>void)|null>(null);
  const currentReorder=useRef(reorder);currentReorder.current=reorder;
  const [drag,setDrag]=useState<{id:string;before:string|null}|null>(null);
  useEffect(()=>()=>cleanup.current?.(),[document]);
  function beginSort(id:string,event:ReactPointerEvent<HTMLButtonElement>){
    if(event.button!==0||!event.isPrimary)return;
    event.stopPropagation();
    cleanup.current?.();
    const startX=event.clientX,startY=event.clientY,pointer=event.pointerId;
    let destination:{before:string|null}|undefined;
    const clear=()=>{
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',finish);
      window.removeEventListener('pointercancel',cancelPointer);
      window.removeEventListener('keydown',key,true);
      window.removeEventListener('blur',clear);
      cleanup.current=null;setDrag(null);
    };
    const move=(next:PointerEvent)=>{
      if(next.pointerId!==pointer||!destination&&Math.hypot(next.clientX-startX,next.clientY-startY)<5)return;
      next.preventDefault();
      const rows=[...list.current?.querySelectorAll<HTMLElement>('[data-annotation-row-id]')||[]];
      if(!rows.some(row=>row.dataset.annotationRowId===id)){clear();return;}
      const target=rows.find(row=>{const box=row.getBoundingClientRect();return next.clientY<box.top+box.height/2;});
      destination={before:target?.dataset.annotationRowId||null};setDrag({id,...destination});
    };
    const finish=(next:PointerEvent)=>{if(next.pointerId!==pointer)return;clear();if(destination)currentReorder.current(id,destination.before);};
    const cancelPointer=(next:PointerEvent)=>{if(next.pointerId===pointer)clear();};
    const key=(next:KeyboardEvent)=>{if(next.key==='Escape'){next.preventDefault();next.stopImmediatePropagation();clear();}};
    window.addEventListener('pointermove',move,{passive:false});
    window.addEventListener('pointerup',finish);
    window.addEventListener('pointercancel',cancelPointer);
    window.addEventListener('keydown',key,true);
    window.addEventListener('blur',clear);
    cleanup.current=clear;
  }
  const focusId=focusRequest&&items.some(item=>item.id===focusRequest.id)?focusRequest.id:null;
  useEffect(()=>{
    if(!focusId)return;
    const item=[...list.current?.querySelectorAll<HTMLElement>('[data-annotation-list-id]')||[]].find(node=>node.dataset.annotationListId===focusId);
    item?.scrollIntoView({block:'nearest',inline:'nearest'});
  },[focusRequest,focusId]);
  useEffect(()=>{
    if(!context)return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const close=()=>setContext(null);
    const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node))close();};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')close();};
    document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key);window.addEventListener('blur',close);
    return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key);window.removeEventListener('blur',close);};
  },[context,document,window]);
  const item=items.find(value=>value.id===context?.id),chosen=items.filter(value=>selected.has(value.id));
  const run=(action:()=>void)=>{setContext(null);action();};
  function backup(){const url=URL.createObjectURL(new Blob([JSON.stringify(items,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='文本标注备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <section className="annotation-panel annotation-title-panel" aria-label="文本标注列表">
    <ol ref={list} className="annotation-title-list" aria-label="标注标题">
      {!items.length&&<li className="annotation-title-empty">暂无标注</li>}
      {items.map((value,index)=>{
        const active=selected.has(value.id)||focusRequest?.id===value.id;
        return <li key={value.id} data-annotation-row-id={value.id} className={'annotation-title-row'+(active?' selected':'')+(value.stale?' stale-title':'')}
          data-dragging={drag?.id===value.id||undefined} data-insert={drag?.before===value.id&&drag.id!==value.id?'before':drag?.before===null&&index===items.length-1?'after':undefined}>
          <button type="button" className="annotation-grip" aria-label={`调整标注顺序：${titleOf(value)}`} title="拖动或按上下方向键调整顺序"
            onPointerDown={event=>beginSort(value.id,event)}
            onKeyDown={event=>{
              if(event.key==='ArrowUp'&&index>0){event.preventDefault();reorder(value.id,items[index-1].id);}
              if(event.key==='ArrowDown'&&index<items.length-1){event.preventDefault();reorder(value.id,items[index+2]?.id||null);}
            }}><GripVertical size={14}/></button>
          <span className="annotation-number" aria-hidden="true">{index+1}</span>
          <button type="button" className="annotation-title-button" data-annotation-list-id={value.id} aria-current={focusRequest?.id===value.id?'true':undefined}
            aria-label={`定位标注：${titleOf(value)}`} title={value.stale?'原文已变化，点击查看上次位置附近；右键可更新位置':value.original.trim()}
            onClick={event=>{if(event.ctrlKey||event.metaKey||event.shiftKey)toggle(value.id);locate(value);}}
            onContextMenu={event=>{event.preventDefault();setContext({id:value.id,x:Math.max(8,Math.min(window.innerWidth-224,event.clientX)),y:Math.max(8,Math.min(window.innerHeight-310,event.clientY))});}}
          >{titleOf(value)}</button>
        </li>;
      })}
    </ol>
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
