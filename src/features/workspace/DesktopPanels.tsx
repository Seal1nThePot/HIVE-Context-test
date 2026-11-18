import {createContext,useCallback,useContext,useEffect,useLayoutEffect,useRef,useState,type ReactNode,type PointerEvent as ReactPointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {EditorView} from '@codemirror/view';
import {PanelDocumentContext} from '../../shared/panelDocument';
import type {Rect} from './panelLayout';
import type {DragControl} from './PanelControl';
import {openPanelContextMenu} from './PanelControl';
import {NativeHostRuntime,type NativePanelHandle,type NativeFloatOptions,type LiveNativeHost} from './nativeHostRuntime';
import {latestGestureFrame,gestureFrameClock} from './gestureFrame';
import './desktop-panels.css';
import {PanelActivityContext,panelIsVisible} from '../../shared/panelActivity';
import type {DockingColors} from '../theme/dockingAppearance';
import type {AboutInfo} from '../../shared/buildInfo';

declare global {
  interface Window {hiveDesktop?:{
    readonly isDesktop:boolean;readonly platform:string;
    startupThemeReady?:(background:string)=>void;
    chooseRepositoryDirectory:()=>Promise<string|null>;
    getAboutInfo:()=>Promise<AboutInfo>;openAppDataDirectory:()=>Promise<void>;
    onCloseRequested:(callback:()=>void)=>()=>void;finishClose:(allow:boolean)=>void;
    onServiceError:(callback:()=>void)=>()=>void;onPanelCloseRequested:(callback:(id:string)=>void)=>()=>void;
    closePanel:(id:string)=>void;windowCommand:(command:'minimize'|'maximize'|'close'|'focus'|'hide',panelId?:string)=>void;
    panelReady:(id:string,placement?:Rect,inactive?:boolean)=>boolean;
    panelRect:(id:string)=>Rect|null;
    panelDrag:(id:string,phase:'start'|'move'|'end'|'cancel',edge?:string,free?:boolean)=>boolean;
    onPanelMove:(callback:(event:{id:string;phase:'move'|'end'|'cancel';x:number;y:number;free?:boolean})=>void)=>()=>void;
    dockOverlay:(feedback:{guides:{key:string;label:string;button:Rect}[];ready:{preview:Rect;button?:Rect}|null;rail?:{edge:'left'|'right';rect:Rect};colors?:DockingColors}|null)=>void;
    dockTooltip:(value:{id:'global-toolbar';text:string;anchor:Rect;width:number;height:number;background:string;color:string;border:string;shadow?:string;fontSize:number}|null)=>void;
  }}
}
type DesktopPanels={
  enabled:boolean;windows:ReadonlyMap<string,Window>;hiddenWindows:ReadonlySet<string>;
  rect:(id:string)=>Rect|null;lastRect:(id:string)=>Rect|null;owner:(id:string)=>string;panelForHost:(id:string)=>string;
  members:(id:string)=>string[]|undefined;refresh:(id:string)=>void;
  beginDrag:(id:string,event:ReactPointerEvent<HTMLElement>,edge?:string)=>void;
  register:(id:string,handle:NativePanelHandle)=>()=>void;removeMember:(id:string,force?:boolean)=>boolean;
  returnMembers:(ids:readonly string[])=>boolean;
  detach:(id:string,options?:NativeFloatOptions)=>void;detachGroup:(id:string,members:string[],select:(id:string)=>void,options?:NativeFloatOptions)=>void;
  extract:(id:string)=>{restore:()=>boolean}|null;attach:(id:string)=>boolean;isComposing:()=>boolean;
  focus:(id:string)=>void;returnAll:()=>void;report:(message:string)=>void;toggleVisibility:(id:string)=>void;
};
const Context=createContext<DesktopPanels|null>(null);
export function useDesktopPanels(){const value=useContext(Context);if(!value)throw new Error('DesktopPanelsProvider is required.');return value;}

function NativeGroupTabs({host,runtime,onDrag}:{host:LiveNativeHost;runtime:NativeHostRuntime;onDrag:DesktopPanels['beginDrag']}){
  const dragged=useRef(new Set<string>());
  return <div className="native-group-tabs" role="tablist" aria-label="组合面板标签" onPointerDown={event=>onDrag(host.id,event)} onKeyDown={event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
    const index=host.members.indexOf(host.active),next=event.key==='Home'?0:event.key==='End'?host.members.length-1:(index+(event.key==='ArrowRight'?1:host.members.length-1))%host.members.length;
    runtime.select(host.id,host.members[next]);event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  }}>{host.members.map(id=><button type="button" key={id} role="tab" data-panel-tab={id} data-panel-context={id} onContextMenu={event=>{event.preventDefault();event.stopPropagation();runtime.select(host.id,id);openPanelContextMenu(event.currentTarget.ownerDocument,id,event.clientX,event.clientY);}} aria-selected={host.active===id} tabIndex={host.active===id?0:-1}
    onPointerDown={event=>{event.stopPropagation();dragged.current.delete(id);host.resource.options.tabDrag?.(id,event,{fromTab:true,onFinish:value=>{if(value)dragged.current.add(id);}});}}
    onClick={event=>{if(event.detail&&dragged.current.has(id)){dragged.current.delete(id);return;}runtime.select(host.id,id);}}>{runtime.handles.get(id)?.title()||id}{runtime.handles.get(id)?.dirty()&&<i className="dirty-dot"/>}</button>)}</div>;
}

export function DesktopPanelsProvider({children}:{children:ReactNode}){
  const [windows,setWindows]=useState(new Map<string,Window>()),[hiddenWindows,setHiddenWindows]=useState(new Set<string>()),[error,report]=useState('');
  const [runtime]=useState(()=>new NativeHostRuntime(()=>{const next=runtime.windows();setWindows(next);setHiddenWindows(old=>{const retained=new Set([...old].filter(id=>next.has(id)));return retained.size===old.size?old:retained;});},report));
  const composition=useRef(false),dragCleanup=useRef<(()=>void)|null>(null);
  const beginDrag=useCallback((id:string,event:ReactPointerEvent<HTMLElement>,edge?:string)=>{
    id=runtime.registry.owner(id);const api=window.hiveDesktop;
    if(!api||event.button!==0||!event.isPrimary||composition.current||runtime.composing([...runtime.handles.keys()]))return;
    if(!edge&&(event.target as Element).closest('button,input,textarea,a,select,[data-no-drag]')&&!(event.target as Element).closest('.global-toolbar-move,[data-panel-tab]'))return;
    event.preventDefault();event.stopPropagation();dragCleanup.current?.();
    const target=event.currentTarget,win=target.ownerDocument.defaultView!,pointer=event.pointerId,start={x:event.clientX,y:event.clientY};
    const tabPress=!!(event.target as Element).closest('[data-panel-tab],.document-tab');let finished=false,free=event.altKey,moved=!tabPress;
    const movement=latestGestureFrame<boolean>(gestureFrameClock(win),value=>api.panelDrag(id,'move',undefined,value));
    const clear=(phase:'end'|'cancel')=>{if(finished)return;finished=true;movement.cancel();win.removeEventListener('pointermove',move);win.removeEventListener('pointerup',up);win.removeEventListener('pointercancel',cancel);win.removeEventListener('keydown',key,true);win.removeEventListener('keyup',key,true);win.removeEventListener('blur',cancel);target.removeEventListener('lostpointercapture',cancel);if(target.hasPointerCapture(pointer))target.releasePointerCapture(pointer);dragCleanup.current=null;api.panelDrag(id,phase==='end'&&!moved?'cancel':phase,undefined,free);};
    const move=(e:globalThis.PointerEvent)=>{if(e.pointerId===pointer){free=e.altKey;if(!moved&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<5)return;moved=true;movement.push(free);}};
    const up=(e:globalThis.PointerEvent)=>{if(e.pointerId===pointer){free=e.altKey;clear('end');}};
    const cancel=()=>clear('cancel');
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}else if(e.key==='Alt'){free=e.altKey;movement.cancel();if(moved)api.panelDrag(id,'move',undefined,free);}};
    if(!api.panelDrag(id,'start',edge,free))return;
    try{target.setPointerCapture(pointer);}catch{api.panelDrag(id,'cancel');return;}
    win.addEventListener('pointermove',move);win.addEventListener('pointerup',up);win.addEventListener('pointercancel',cancel);win.addEventListener('keydown',key,true);win.addEventListener('keyup',key,true);win.addEventListener('blur',cancel);target.addEventListener('lostpointercapture',cancel);dragCleanup.current=cancel;
  },[runtime]);
  const register=useCallback((id:string,handle:NativePanelHandle)=>{runtime.handles.set(id,handle);return()=>{if(runtime.handles.get(id)===handle){runtime.removeMember(id,true);runtime.handles.delete(id);}};},[runtime]);
  const removeMember=useCallback((id:string,force=false)=>runtime.removeMember(id,force),[runtime]);
  const refresh=useCallback((id:string)=>runtime.refresh(id),[runtime]);
  const attach=useCallback((id:string)=>runtime.close(id),[runtime]);
  const returnMembers=useCallback((ids:readonly string[])=>runtime.returnMembers(ids),[runtime]);
  const returnAll=useCallback(()=>runtime.returnMembers(runtime.registry.values().flatMap(host=>host.members)),[runtime]);
  useLayoutEffect(()=>{document.documentElement.classList.toggle('hive-desktop',!!window.hiveDesktop?.isDesktop);return()=>document.documentElement.classList.remove('hive-desktop');},[]);
  useEffect(()=>{const start=()=>{composition.current=true;},end=()=>{composition.current=false;};document.addEventListener('compositionstart',start,true);document.addEventListener('compositionend',end,true);return()=>{document.removeEventListener('compositionstart',start,true);document.removeEventListener('compositionend',end,true);};},[]);
  useEffect(()=>window.hiveDesktop?.onPanelCloseRequested(id=>{const event=new CustomEvent('hive:panel-close-requested',{cancelable:true,detail:id});if(window.dispatchEvent(event))attach(id);}),[attach]);
  useEffect(()=>()=>dragCleanup.current?.(),[]);useEffect(()=>()=>{returnAll();},[returnAll]);
  const hosts=runtime.registry.values().filter(host=>host.group&&host.resource.connected&&!host.resource.child.closed);
  const docs=[document,...new Set([...windows.values()].map(child=>child.document))];
  return <Context.Provider value={{enabled:!!window.hiveDesktop?.isDesktop,windows,hiddenWindows,beginDrag,register,removeMember,returnMembers,refresh,attach,returnAll,report,
    owner:id=>runtime.registry.owner(id),panelForHost:id=>runtime.registry.get(id)?.active||id,members:id=>runtime.registry.get(id)?.members,
    rect:id=>runtime.rect(id),lastRect:id=>runtime.lastRects.get(id)||null,
    detach:(id,options)=>runtime.open(id,options),detachGroup:(id,members,select,options)=>runtime.open(id,options,members,select),extract:id=>runtime.extract(id),
    isComposing:()=>composition.current||runtime.composing([...runtime.handles.keys()]),
    focus:id=>{const host=runtime.registry.get(id);if(host)window.hiveDesktop?.windowCommand('focus',host.id);else runtime.handles.get(id)?.focus();},
    toggleVisibility:id=>{const host=runtime.registry.get(id);if(!host)return;const hidden=host.members.every(member=>hiddenWindows.has(member));window.hiveDesktop?.windowCommand(hidden?'focus':'hide',host.id);setHiddenWindows(old=>{const next=new Set(old);for(const member of host.members){if(hidden)next.delete(member);else next.add(member);}return next;});}
  }}>{children}{hosts.map(host=>createPortal(<NativeGroupTabs host={host} runtime={runtime} onDrag={beginDrag}/>,host.resource.child.document.body,'native-group-'+host.id))}
    {error&&docs.map((doc,index)=>createPortal(<div className="desktop-window-error" role="alert">{error}<button onClick={()=>report('')}>关闭</button></div>,doc.body,'window-error-'+index))}
  </Context.Provider>;
}

/** Only the stable DOM container changes document; React and EditorView stay owned here. */
export function DesktopPanel({id,title,open,visible=open,children}:{id:string;title:string;open:boolean;visible?:boolean;children:ReactNode;variant?:'panel'|'toolbar'}){
  const desktop=useDesktopPanels(),[container]=useState(()=>{const node=document.createElement('div');node.className='desktop-panel-surface';return node;});
  const home=useRef<HTMLDivElement>(null),composition=useRef(false),latest=useRef(title);latest.current=title;
  const [owner,setOwner]=useState(document);
  const [nativeActive,setNativeActive]=useState<boolean|null>(null),[documentHidden,setDocumentHidden]=useState(document.hidden);
  useEffect(()=>{const update=()=>setDocumentHidden(owner.hidden);update();owner.addEventListener('visibilitychange',update);return()=>owner.removeEventListener('visibilitychange',update);},[owner]);
  const move=useCallback((parent:HTMLElement)=>{
    const scroll=[...container.querySelectorAll<HTMLElement>('.cm-scroller')].map(node=>[node,node.scrollTop,node.scrollLeft] as const);parent.appendChild(container);const doc=parent.ownerDocument;
    for(const element of container.querySelectorAll<HTMLElement>('.cm-editor')){const view=EditorView.findFromDOM(element);view?.setRoot(doc);view?.requestMeasure();view?.dom.dispatchEvent(new Event('hive:panel-document-changed'));}
    for(const [node,top,left] of scroll){node.scrollTop=top;node.scrollLeft=left;}setOwner(doc);
  },[container]);
  const isComposing=useCallback(()=>composition.current||[...container.querySelectorAll<HTMLElement>('.cm-editor')].some(element=>EditorView.findFromDOM(element)?.composing),[container]);
  useLayoutEffect(()=>{if(home.current)home.current.appendChild(container);const start=()=>{composition.current=true;},end=()=>{composition.current=false;};container.addEventListener('compositionstart',start,true);container.addEventListener('compositionend',end,true);return()=>{desktop.removeMember(id,true);container.removeEventListener('compositionstart',start,true);container.removeEventListener('compositionend',end,true);container.remove();};},[container,id,desktop.removeMember]);
  useEffect(()=>desktop.register(id,{mount:move,home:()=>{if(home.current)move(home.current);},active:value=>{setNativeActive(value);if(value===null)delete container.dataset.nativeActive;else container.dataset.nativeActive=String(value);},title:()=>container.querySelector('.document-tab > span')?.textContent||latest.current,dirty:()=>!!container.querySelector('.dirty-dot'),focus:()=>container.querySelector<HTMLElement>('.cm-content,button,input,textarea')?.focus(),isComposing}),[desktop.register,id,container,move,isComposing]);
  useEffect(()=>{if(!open)desktop.removeMember(id);},[open,id,desktop.removeMember]);
  useEffect(()=>{desktop.refresh(id);},[title,id,desktop.refresh]);
  useEffect(()=>{const observer=new MutationObserver(()=>desktop.refresh(id));observer.observe(container.querySelector('.panel-drag-header')||container,{subtree:true,childList:true,characterData:true});return()=>observer.disconnect();},[container,id,desktop.refresh]);
  const active=panelIsVisible(open,visible,owner!==document,nativeActive,desktop.hiddenWindows.has(id),documentHidden);
  return <><div className="desktop-panel-home" ref={home}/>{createPortal(<PanelDocumentContext.Provider value={owner}><PanelActivityContext.Provider value={active}>{children}</PanelActivityContext.Provider></PanelDocumentContext.Provider>,container)}</>;
}

