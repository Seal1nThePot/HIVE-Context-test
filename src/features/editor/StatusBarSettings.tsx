import {useEffect,useId,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {ChevronDown,GripVertical,Plus,X} from "../../shared/icons";
import type {StatusPreferences} from './EditorStatusBar';
import {countDescription,paragraphDescription,placeStatusItem,statusItems,statusLabel,type StatusKey} from './statusModel';
import './status-bar-settings.css';

export default function StatusBarSettings({preferences}:{preferences:StatusPreferences}){
  const [expanded,setExpanded]=useState(false),[dragging,setDragging]=useState<StatusKey|null>(null),[insertion,setInsertion]=useState<number|null>(null),[overAvailable,setOverAvailable]=useState(false),[notice,setNotice]=useState('');
  const panel=useRef<HTMLDivElement>(null),cleanup=useRef<(()=>void)|null>(null),skipClick=useRef(false),latest=useRef(preferences),panelId=useId();latest.current=preferences;
  useEffect(()=>{if(expanded)panel.current?.scrollIntoView({block:'nearest'});else cleanup.current?.();},[expanded]);
  useEffect(()=>()=>cleanup.current?.(),[]);
  const label=(key:StatusKey)=>key==='count'?(preferences.countMode==='text'?'纯字数':'字符数'):statusLabel(key);
  const available=statusItems.filter(([key])=>!preferences.items.includes(key));
  function change(items:StatusKey[],message:string){latest.current.setItems(items);setNotice(message);}
  function start(key:StatusKey,event:ReactPointerEvent){
    if(event.button!==0||!event.isPrimary)return;cleanup.current?.();skipClick.current=false;
    // The React owner stays in the main renderer when settings moves to a child window.
    const target=event.currentTarget,doc=target.ownerDocument,win=doc.defaultView;if(!win)return;
    const origin={x:event.clientX,y:event.clientY},pointerId=event.pointerId;let active=true,moving=false,drop:{zone:'shown'|'available';index:number}|null=null;
    const clean=()=>{if(!active)return;active=false;win.removeEventListener('pointermove',move);win.removeEventListener('pointerup',finish);win.removeEventListener('pointercancel',cancel);win.removeEventListener('blur',cancel);win.removeEventListener('keydown',keyDown,true);target.removeEventListener('lostpointercapture',cancel);if(target.hasPointerCapture(pointerId))target.releasePointerCapture(pointerId);cleanup.current=null;setDragging(null);setInsertion(null);setOverAvailable(false);};
    const cancel=()=>{if(moving)skipClick.current=true;drop=null;clean();};
    const keyDown=(next:KeyboardEvent)=>{if(next.key==='Escape'){next.preventDefault();next.stopPropagation();cancel();}};
    const locate=(next:PointerEvent)=>{
      const hit=doc.elementFromPoint(next.clientX,next.clientY),zone=hit?.closest<HTMLElement>('[data-status-zone]');drop=null;
      if(zone&&panel.current?.contains(zone)){
        const item=hit?.closest<HTMLElement>('[data-status-index]'),rect=item?.getBoundingClientRect();
        drop={zone:zone.dataset.statusZone as 'shown'|'available',index:item&&rect?Number(item.dataset.statusIndex)+(next.clientX>rect.x+rect.width/2?1:0):latest.current.items.length};
      }
    };
    const move=(next:PointerEvent)=>{if(next.pointerId!==pointerId)return;if(!moving&&Math.hypot(next.clientX-origin.x,next.clientY-origin.y)<5)return;
      moving=true;next.preventDefault();setDragging(key);locate(next);
      setOverAvailable(drop?.zone==='available');setInsertion(drop?.zone==='shown'?drop.index:null);
    };
    const finish=(next:PointerEvent)=>{if(next.pointerId!==pointerId)return;if(moving)locate(next);const destination=drop;clean();if(!moving)return;next.preventDefault();skipClick.current=true;
      if(destination?.zone==='shown')change(placeStatusItem(latest.current.items,key,destination.index),'显示顺序已更新');
      else if(destination?.zone==='available')change(latest.current.items.filter(item=>item!==key),`已移除${label(key)}`);
    };
    win.addEventListener('pointermove',move,{passive:false});win.addEventListener('pointerup',finish);win.addEventListener('pointercancel',cancel);win.addEventListener('blur',cancel);win.addEventListener('keydown',keyDown,true);target.addEventListener('lostpointercapture',cancel);cleanup.current=cancel;
    try{target.setPointerCapture(pointerId);}catch{/* Window listeners still handle hosts without pointer capture. */}
  }
  return <section className="settings-card status-bar-settings status-customizer" data-status-dragging={!!dragging}>
    <div className="status-customizer-summary"><div><h2>写作区底部栏</h2><p>{preferences.items.length?preferences.items.map(label).join(' · '):'未显示信息项'}</p></div><button type="button" className="settings-secondary" aria-expanded={expanded} aria-controls={panelId} onClick={()=>setExpanded(value=>!value)}>自定义<ChevronDown size={14} className={expanded?'expanded':''}/></button></div>
    {expanded&&<div ref={panel} id={panelId} className="status-customizer-panel">
      <div className="status-tray-heading"><b>显示顺序</b><small>拖入项目，左右拖动排序</small></div>
      <div className={'status-drop-tray '+(dragging&&!overAvailable?'accepting ':'')+(insertion===preferences.items.length?'insert-end':'')} role="group" aria-label="底栏显示顺序" data-status-zone="shown">
        {preferences.items.map((key,index)=><div className={'status-config-chip '+(dragging===key?'dragging ':'')+(insertion===index?'insert-before':'')} key={key} data-status-index={index}>
          <button type="button" onPointerDown={event=>start(key,event)} className="status-chip-handle" aria-label={`拖动${label(key)}排序`} title="拖动排序；Alt+左右方向键调整位置" onKeyDown={event=>{
            if(event.altKey&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const next=[...preferences.items],target=index+(event.key==='ArrowLeft'?-1:1);if(target>=0&&target<next.length){[next[index],next[target]]=[next[target],next[index]];change(next,'显示顺序已更新');}}
          }}><GripVertical size={12}/>{label(key)}</button><button type="button" aria-label={`移除${label(key)}`} title="不在底栏显示" onClick={()=>change(preferences.items.filter(item=>item!==key),`已移除${label(key)}`)}><X size={12}/></button>
        </div>)}
        {!preferences.items.length&&<span className="status-tray-empty">将下方项目拖到这里</span>}
      </div>
      <div className="status-tray-heading"><b>可添加</b><small>点击或拖入上方；拖回此处可移除</small></div>
      <div className={'status-available-tray '+(overAvailable?'accepting':'')} role="group" aria-label="可添加的底栏项目" data-status-zone="available">
        {available.map(([key])=><button key={key} type="button" onPointerDown={event=>start(key,event)} onClick={event=>{const skip=skipClick.current&&event.detail!==0;skipClick.current=false;if(!skip)change([...preferences.items,key],`已添加${label(key)}`);}}><Plus size={12}/>{label(key)}</button>)}
        {!available.length&&<span className="status-tray-empty">所有项目均已显示</span>}
      </div>
      <div className="status-count-setting"><label>总字数<select aria-label="总字数统计方式" value={preferences.countMode} onChange={event=>preferences.setCountMode(event.target.value==='text'?'text':'characters')}><option value="characters">字符数</option><option value="text">纯字数</option></select></label><button type="button" className="text-button" onClick={()=>{preferences.reset();setNotice('已恢复为仅显示字符数');}}>恢复默认</button></div>
      <p className="status-count-description">{countDescription}<br/>{paragraphDescription}</p>
      <span role="status" className="status-config-notice">{notice}</span>
    </div>}
    {preferences.error&&<p role="alert">{preferences.error}</p>}
  </section>;
}
