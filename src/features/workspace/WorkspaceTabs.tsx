import { Fragment, useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import type { DragControl } from "./PanelControl";
import {openPanelContextMenu} from './PanelControl';
import type { PanelGroup } from "./panelLayout";
import {NewTabButton} from '../editor/NewTabPage';
import {X} from 'lucide-react';
export default function WorkspaceTabs({group,style,label,onSelect,onDrag,onTabDrag,isDirty,handles,controls,onNewTab,newTabDisabled,positionLocked,lockHint,onRaise,onCloseTab}: {
  group:PanelGroup;style:CSSProperties;label:(id:string)=>string;onSelect:(id:string)=>void;
  onDrag:(id:string,event:PointerEvent<HTMLElement>,control?:DragControl)=>void;onRaise:()=>void;handles:ReactNode;controls:ReactNode;
  onTabDrag?:(id:string,event:PointerEvent<HTMLElement>,control?:DragControl)=>void;isDirty?:(id:string)=>boolean;
  onNewTab?:()=>void;onCloseTab?:(id:string)=>void;newTabDisabled?:boolean;positionLocked?:boolean;lockHint?:string;
}){
  const dragged=useRef(new Set<string>());
  return <div className={'workspace-tab-frame '+(style.position==='absolute'?'workspace-group-docked':'workspace-group-floating')} data-tab-group={group.id} style={style} onPointerDownCapture={onRaise}>
    <div className="workspace-group-header panel-drag-header" data-panel-context={group.active} data-lock-panel={group.active} data-position-locked={positionLocked||undefined} title={lockHint} onPointerDown={event=>onDrag(group.active,event)}>
    <div className={onNewTab?'workspace-document-tabs':'workspace-tool-tabs'}><div className="workspace-tabs" role="tablist" aria-label="组合面板标签" onKeyDown={event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
      const index=group.panels.indexOf(group.active),next=event.key==='Home'?0:event.key==='End'?group.panels.length-1:(index+(event.key==='ArrowRight'?1:group.panels.length-1))%group.panels.length;
      onSelect(group.panels[next]);event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
    }}>
      {group.panels.map(id=>{
        const tab=<button role="tab" data-panel-tab={id} onContextMenu={event=>{event.preventDefault();event.stopPropagation();onSelect(id);openPanelContextMenu(event.currentTarget.ownerDocument,id,event.clientX,event.clientY);}} aria-selected={group.active===id} tabIndex={group.active===id?0:-1} title={`${label(id)} · ${onTabDrag?'拖动移出此标签':lockHint||'拖动移动整个标签组'}`} onPointerDown={event=>{
          event.stopPropagation();dragged.current.delete(id);(onTabDrag||onDrag)(id,event,{fromTab:true,onFinish:value=>{if(value)dragged.current.add(id);}});
        }} onClick={event=>{if(event.detail&&dragged.current.has(id)){dragged.current.delete(id);return;}onSelect(id);}}>{onNewTab?<><span className="workspace-tab-label">{label(id)}</span>{isDirty?.(id)&&<i className="dirty-dot" aria-label="未保存"/>}</>:label(id)}</button>;
        return onCloseTab?<div key={id} className="workspace-tab-item" data-selected={group.active===id||undefined}>{tab}<button type="button" className="document-tab-close" data-no-drag aria-label={`关闭${label(id)}标签页`} title="关闭标签页" onPointerDown={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();onCloseTab(id);}}><X size={13}/></button></div>:<Fragment key={id}>{tab}</Fragment>;
      })}
    </div>{onNewTab&&<NewTabButton onClick={onNewTab} disabled={newTabDisabled}/>}</div>{controls}</div>{handles}
  </div>;
}
