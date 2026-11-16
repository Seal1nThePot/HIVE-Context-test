import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import type { DragControl } from "./PanelControl";
import type { PanelGroup } from "./panelLayout";
import {NewTabButton} from '../editor/NewTabPage';
export default function WorkspaceTabs({group,style,label,onSelect,onDrag,handles,controls,onNewTab,newTabDisabled,positionLocked,lockHint,onRaise}: {
  group:PanelGroup;style:CSSProperties;label:(id:string)=>string;onSelect:(id:string)=>void;
  onDrag:(id:string,event:PointerEvent<HTMLElement>,control?:DragControl)=>void;onRaise:()=>void;handles:ReactNode;controls:ReactNode;
  onNewTab?:()=>void;newTabDisabled?:boolean;positionLocked?:boolean;lockHint?:string;
}){
  const dragged=useRef(new Set<string>());
  return <div className="workspace-tab-frame" data-tab-group={group.id} style={style} onPointerDownCapture={onRaise}>
    <div className="workspace-group-header panel-drag-header" data-lock-panel={group.active} data-position-locked={positionLocked||undefined} title={lockHint} onPointerDown={event=>onDrag(group.active,event)}>
    <div className={onNewTab?'workspace-document-tabs':'workspace-tool-tabs'}><div className="workspace-tabs" role="tablist" aria-label="组合面板标签" onKeyDown={event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
      const index=group.panels.indexOf(group.active),next=event.key==='Home'?0:event.key==='End'?group.panels.length-1:(index+(event.key==='ArrowRight'?1:group.panels.length-1))%group.panels.length;
      onSelect(group.panels[next]);event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
    }}>
      {group.panels.map(id=><button key={id} role="tab" data-panel-tab={id} aria-selected={group.active===id} tabIndex={group.active===id?0:-1} title={`${label(id)} · ${lockHint||'拖动移动整个标签组'}`} onContextMenu={event=>event.preventDefault()} onPointerDown={event=>{
        event.stopPropagation();dragged.current.delete(id);onDrag(id,event,{fromTab:true,onFinish:value=>{if(value)dragged.current.add(id);}});
      }} onClick={event=>{if(event.detail&&dragged.current.has(id)){dragged.current.delete(id);return;}onSelect(id);}}>{label(id)}</button>)}
    </div>{onNewTab&&<NewTabButton onClick={onNewTab} disabled={newTabDisabled}/>}</div>{controls}</div>{handles}
  </div>;
}
