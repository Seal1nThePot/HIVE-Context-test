import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Lock, LockOpen, PanelsTopLeft, X } from "lucide-react";
import { filterPanels, groupPanels, panelCategories, type PanelCategory, type PanelItem } from "./panelCatalog";
export type { PanelCategory, PanelItem } from "./panelCatalog";
import "./panel-switcher.css";

type Position = { x:number; y:number };

export default function PanelSwitcher({items,onToggle,onToggleLock,onReveal}: {
  items:PanelItem[]; onToggle:(id:string)=>void; onToggleLock?:(id:string)=>void; onReveal?:(id:string)=>void;
}) {
  const [open,setOpen]=useState(false),[position,setPosition]=useState<Position|null>(null);
  const [category,setCategory]=useState<PanelCategory|"all">("all"),[query,setQuery]=useState("");
  const button=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDivElement>(null),search=useRef<HTMLInputElement>(null);
  const dragCleanup=useRef<(()=>void)|null>(null);

  function constrain(point:Position):Position {
    const rect=dialog.current?.getBoundingClientRect();
    const width=rect?.width||0,height=rect?.height||0;
    return {x:Math.max(8,Math.min(point.x,window.innerWidth-width-8)),y:Math.max(8,Math.min(point.y,window.innerHeight-height-8))};
  }
  function close(restoreFocus=false) {
    dragCleanup.current?.();
    setOpen(false);
    if(restoreFocus)button.current?.focus();
  }
  useEffect(()=>{
    if(!open)return;
    const rect=dialog.current?.getBoundingClientRect();
    if(rect)setPosition(constrain({x:(window.innerWidth-rect.width)/2,y:(window.innerHeight-rect.height)/2}));
    search.current?.focus();
    const outside=(event:globalThis.PointerEvent)=>{
      if(!dialog.current?.contains(event.target as Node)&&!button.current?.contains(event.target as Node))close();
    };
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}
    };
    const resize=()=>setPosition(old=>old?constrain(old):old);
    document.addEventListener('pointerdown',outside);
    document.addEventListener('keydown',key);
    window.addEventListener('resize',resize);
    return()=>{dragCleanup.current?.();document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);window.removeEventListener('resize',resize);};
  },[open]);
  function beginDrag(event:ReactPointerEvent<HTMLDivElement>) {
    if(event.button!==0||(event.target as Element).closest('button,[data-no-drag]'))return;
    const element=event.currentTarget,rect=dialog.current?.getBoundingClientRect();
    if(!rect)return;
    const startX=event.clientX,startY=event.clientY,pointerId=event.pointerId;
    let dragging=false;
    const cleanup=()=>{
      window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);
      window.removeEventListener('pointercancel',end);window.removeEventListener('blur',end);
      element.removeEventListener('lostpointercapture',end);
      if(element.hasPointerCapture(pointerId))element.releasePointerCapture(pointerId);
      dragCleanup.current=null;
    };
    const move=(e:globalThis.PointerEvent)=>{
      if(e.pointerId!==pointerId)return;
      const dx=e.clientX-startX,dy=e.clientY-startY;
      if(!dragging&&Math.hypot(dx,dy)<5)return;
      if(!dragging){dragging=true;element.setPointerCapture(pointerId);}
      setPosition(constrain({x:rect.left+dx,y:rect.top+dy}));
    };
    const end=(e:Event)=>{if('pointerId' in e&&(e as globalThis.PointerEvent).pointerId!==pointerId)return;cleanup();};
    dragCleanup.current?.();dragCleanup.current=cleanup;
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);
    window.addEventListener('pointercancel',end);window.addEventListener('blur',end);
    element.addEventListener('lostpointercapture',end);
  }
  return <><button ref={button} type="button" className="icon-button" aria-label="面板" title="面板" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{
    if(open)close();else {setPosition(null);setCategory('all');setQuery('');setOpen(true);}
  }}><PanelsTopLeft size={17}/></button>
    {open&&createPortal(<div ref={dialog} className="panel-manager" role="dialog" aria-label="面板管理" style={position?{left:position.x,top:position.y}:{left:'50%',top:'50%',transform:'translate(-50%, -50%)'}}>
      <div className="panel-manager-header" onPointerDown={beginDrag}>
        <span>面板管理</span>
        <button type="button" className="panel-manager-close" aria-label="关闭面板管理" title="关闭" onClick={()=>close(true)}><X size={16}/></button>
      </div>
      <div className="panel-manager-search"><input ref={search} type="search" aria-label="搜索面板" placeholder="搜索面板名称、说明或关键词" value={query} onChange={event=>setQuery(event.target.value)} /></div>
      <div className="panel-manager-body">
        <nav className="panel-manager-categories" aria-label="面板分类">
          <button type="button" aria-pressed={category==='all'} onClick={()=>setCategory('all')}>全部 <span>{items.length}</span></button>
          {panelCategories.map(group=><button key={group.id} type="button" aria-pressed={category===group.id} onClick={()=>setCategory(group.id)}>{group.label} <span>{groupPanels(items)[group.id].length}</span></button>)}
        </nav>
        <div className="panel-manager-list">
          {(()=>{const groups=groupPanels(filterPanels(items,category,query)); const count=Object.values(groups).reduce((sum,group)=>sum+group.length,0);
            return count ? panelCategories.map(group=>groups[group.id].length>0 && <section key={group.id} className="panel-manager-group" aria-label={group.label}>
              <h3>{group.label}</h3>
              {groups[group.id].map(item=>{const locked=item.fixed||!!item.locked; return <div className="panel-manager-row" key={item.id}>
                <button type="button" className="panel-manager-reveal" title="定位或打开面板" onClick={()=>{if(onReveal){onReveal(item.id);close();}}} disabled={!onReveal}>
                  <span>{item.label}{item.fixed?'（主版面）':''}</span>{item.description&&<small>{item.description}</small>}
                </button>
                <button type="button" className="panel-manager-toggle" role="switch" aria-label={`${item.label}显示`} aria-checked={item.open} disabled={item.fixed} title={item.fixed?'正文主版面始终保留':item.open?'隐藏面板':'显示面板'} onClick={()=>onToggle(item.id)}><span className="panel-manager-switch" aria-hidden="true" /></button>
                <button type="button" className="panel-manager-lock" aria-label={`${locked?'解锁':'锁定'}${item.label}位置`} aria-pressed={locked} disabled={item.fixed||!onToggleLock} title={item.fixed?'正文主版面位置固定':locked?'解锁位置':'锁定位置'} onClick={()=>onToggleLock?.(item.id)}>{locked?<Lock size={15}/>:<LockOpen size={15}/>}</button>
              </div>;})}
            </section>) : <p className="panel-manager-empty">没有找到面板</p>;
          })()}
        </div>
      </div>
    </div>,document.body)}
  </>;
}
