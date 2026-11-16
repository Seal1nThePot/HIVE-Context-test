import { createRef, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { dockedPanels, dockResizeEdges, measureDockTree, resizeDockSplit, PANEL_HEADER_HEIGHT, type DockEdge, type DockPlacementEdge, type Rect } from "./panelLayout";
import { completeWorkspace, defaultWorkspace, detachWorkspacePanel, hideWorkspacePanel, openWorkspacePanel, placeWorkspacePanel, placeWorkspacePanelAtEdge, floatWorkspaceGroup, placeWorkspaceGroup, closeWorkspacePanelPreservingAutoHide, type WorkspaceLayout } from "./workspaceState";
import {autoHidePanelRect,collapseAutoHidePanel,nearestPanelEdge,panelAutoHidePlacement,releaseAutoHidePanel,withAutoHideMetadata,repositionAutoHidePanel} from "./autoHide";
import DockGuides from "./DockGuides";
import {DockIntent,type DockScene,type DockPointer,type DockFeedback} from "./dockInteraction";
import type { DragControl } from "./PanelControl";
import { fitFloatingRect, resizeFloatingRect } from "./panelUiGeometry";
import {canMovePanel,canPlacePanel,isEditorPanel,PRIMARY_EDITOR,rankedFloatingLayers,retainPrimaryEditor,panelLayers,openDockedPanel,openContentsPanel,fitPanelInStage,isFreelyMovableTool} from './workspacePolicy';
import {isPanelPositionLocked,togglePanelPositionLock,canResizeSplit,openTrashPanel,dockAutoHideRail,canDockAutoHideRail} from './workspacePolicy';
import {PanelLockGestureTracker,type PanelLockGesture} from './panelLockGesture';
export function usePanelWorkspace(stage: RefObject<HTMLDivElement|null>,onActivate?:(id:string)=>void,headerHeight=PANEL_HEADER_HEIGHT,lockGesture:PanelLockGesture='doubleClick') {
  const [rawLayout,setLayout]=useState<WorkspaceLayout>(defaultWorkspace),[bounds,setBounds]=useState<Rect>({x:0,y:160,width:window.innerWidth,height:window.innerHeight-185}),
    [dragging,setDragging]=useState<string|null>(null),[dockFeedback,setDockFeedback]=useState<DockFeedback|null>(null);
  const normalize=(value:WorkspaceLayout,area:Rect)=>{const next=retainPrimaryEditor(withAutoHideMetadata(completeWorkspace(value),area));return {...next,layers:rankedFloatingLayers(next.layers)};};
  const layout=normalize(rawLayout,bounds);
  const refs=useRef(new Map<string,RefObject<HTMLElement|null>>()),latest=useRef(layout),cleanup=useRef<(()=>void)|null>(null);
  latest.current=layout;
  const boundsRef=useRef(bounds);boundsRef.current=bounds;
  const dragIntent=useRef<{id:string;point:DockPointer;intent:DockIntent;timer:ReturnType<typeof setInterval>;keys:(event:KeyboardEvent)=>void;signature:string}|null>(null);
  const iconAnchors=useRef(new Map<string,Rect>());
  const update=(change:(old:WorkspaceLayout)=>WorkspaceLayout)=>setLayout(old=>{const next=normalize(change(normalize(old,boundsRef.current)),boundsRef.current);latest.current=next;return next;});
  function togglePositionLock(id:string){
    if(id===PRIMARY_EDITOR)return;
    cleanup.current?.();setDragging(null);stopDocking();update(old=>togglePanelPositionLock(old,id));
  }
  useEffect(()=>{
    let held=false,lastPointerType='';
    const tracker=new PanelLockGestureTracker(lockGesture,id=>{held=true;togglePositionLock(id);});
    const target=(event:Event)=>{
      const element=event.target instanceof Element?event.target:null,header=element?.closest<HTMLElement>('.panel-drag-header[data-lock-panel]');
      if(!header||!stage.current?.contains(header))return null;
      if(element?.closest('button,input,textarea,a,select,[data-no-drag]')&&!element.closest('[data-panel-tab]'))return null;
      const id=element?.closest<HTMLElement>('[data-panel-tab]')?.dataset.panelTab||header.dataset.lockPanel;
      return id&&id!==PRIMARY_EDITOR?id:null;
    };
    const down=(event:globalThis.PointerEvent)=>{lastPointerType=event.pointerType;if(event.button!==0||!event.isPrimary)return;held=false;const id=target(event);if(id)tracker.start(id,event.clientX,event.clientY,event.pointerId);};
    const move=(event:globalThis.PointerEvent)=>tracker.move(event.clientX,event.clientY,event.pointerId);
    const up=(event:globalThis.PointerEvent)=>tracker.end(event.pointerId);
    const cancel=()=>{tracker.cancel();held=false;};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')cancel();};
    const dbl=(event:MouseEvent)=>{const id=target(event);if(id&&tracker.doubleClick(id)){held=false;event.preventDefault();event.stopPropagation();}};
    const click=(event:MouseEvent)=>{if(held&&target(event)){held=false;event.preventDefault();event.stopPropagation();}};
    const context=(event:MouseEvent)=>{if(lockGesture==='longPress'&&(held||lastPointerType==='touch'||lastPointerType==='pen')&&target(event))event.preventDefault();};
    document.addEventListener('pointerdown',down,true);document.addEventListener('pointermove',move,true);document.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',cancel,true);
    document.addEventListener('dblclick',dbl,true);document.addEventListener('click',click,true);document.addEventListener('contextmenu',context,true);window.addEventListener('blur',cancel);window.addEventListener('keydown',key,true);
    return()=>{cancel();document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',cancel,true);document.removeEventListener('dblclick',dbl,true);document.removeEventListener('click',click,true);document.removeEventListener('contextmenu',context,true);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key,true);};
  },[lockGesture,stage]);
  const viewport=()=>({width:window.innerWidth,height:window.innerHeight});
  const fit=(rect:Rect,id?:string,source=latest.current)=>{const fitted=fitFloatingRect(rect,viewport());return id&&isFreelyMovableTool(source,id)?fitted:fitPanelInStage(fitted,boundsRef.current);};
  const refFor=(id:string)=>{if(!refs.current.has(id))refs.current.set(id,createRef<HTMLElement>());return refs.current.get(id)!;};
  useEffect(()=>{
    const measure=()=>{
      const rect=stage.current?.getBoundingClientRect();if(rect)setBounds({x:rect.x,y:rect.y,width:rect.width,height:rect.height});
      update(old=>{let changed=false;const rects={...old.rects};for(const [id,value] of Object.entries(rects)){const next=fit(value,id);if(Object.keys(next).some(key=>next[key as keyof Rect]!==value[key as keyof Rect])){rects[id]=next;changed=true;}}return changed?{...old,rects}:old;});
    };
    const observer=new ResizeObserver(measure);if(stage.current)observer.observe(stage.current);measure();window.addEventListener('resize',measure);
    return()=>{observer.disconnect();window.removeEventListener('resize',measure);cleanup.current?.();};
  },[stage]);
  const measurements=measureDockTree(layout.tree,{x:0,y:0,width:bounds.width,height:bounds.height});
  function suggestedRect(id:string):Rect{
    if(id==='search')return fit({x:bounds.x+bounds.width*.48,y:bounds.y+24,width:Math.min(450,bounds.width),height:Math.min(295,bounds.height)},id);
    const editor=refFor('editor').current?.getBoundingClientRect(),width=Math.min(id==='scratch'?(editor?.width||640):id.startsWith('editor')?650:380,window.innerWidth-24),height=Math.min(id==='scratch'?(editor?.height||520):520,window.innerHeight-60);
    const offset=latest.current.open.length%5*22;return fit({x:bounds.x+bounds.width*.28+offset,y:bounds.y+30+offset,width,height},id);
  }
  const floatingGroups=layout.floatingGroups.map(group=>({...group,rect:fit(layout.rects[group.id]||suggestedRect(group.active),group.id),floating:true}));
  const tabGroups=[...measurements.groups.map(group=>({...group,floating:false})),...floatingGroups];
  function groupFor(id:string){return tabGroups.find(group=>group.panels.includes(id));}
  function currentRect(id:string,wholeGroup=false):Rect{
    const group=groupFor(id);
    if(group&&wholeGroup)return {...group.rect,x:group.rect.x+(group.floating?0:bounds.x),y:group.rect.y+(group.floating?0:bounds.y)};
    const box=refFor(id).current?.getBoundingClientRect();if(box&&box.width>0)return {x:box.x,y:box.y,width:box.width,height:box.height};
    const rect=measurements.panels[id];if(rect)return {x:rect.x+bounds.x,y:rect.y+bounds.y,width:rect.width,height:rect.height};
    if(group)return group.rect;return fit(latest.current.rects[id]||suggestedRect(id),id);
  }
  function raise(id:string){if(dockedPanels(latest.current.tree).includes(id)&&!latest.current.autoHide?.[id])return;const group=latest.current.floatingGroups.find(value=>value.panels.includes(id));const key=group?.id||id;update(old=>({...old,layers:rankedFloatingLayers(old.layers,key)}));}
  function open(id:string){const rect=fit(latest.current.rects[id]||suggestedRect(id),id);update(old=>{
    let next:WorkspaceLayout;
    if(id==='toc')next=openContentsPanel(old,rect);
    else if(id==='trash')next=openTrashPanel(old,rect);
    else if(isEditorPanel(id)&&!old.open.includes(id)&&!old.restore[id]&&!old.autoHide?.[id]&&canPlacePanel({...old,open:[...old.open,id]},id,PRIMARY_EDITOR,'right'))next=placeWorkspacePanel(old,id,PRIMARY_EDITOR,'right',rect);
    else next=openWorkspacePanel(old,id,rect);
    if(!dockedPanels(next.tree).includes(id)||next.autoHide?.[id]){const key=next.floatingGroups.find(group=>group.panels.includes(id))?.id||id;next={...next,layers:rankedFloatingLayers(next.layers,key)};}
    return next;
  });onActivate?.(id);}
  function toggleAutoHide(id:string,anchor?:Rect){
    if(anchor)iconAnchors.current.set(id,anchor);
    if(latest.current.autoHideActive===id){update(old=>collapseAutoHidePanel(old,id));return;}
    open(id);
  }
  function repositionAutoHide(id:string,offset:number,edge?:'left'|'right'){
    if(!Number.isFinite(offset)||(edge!==undefined&&edge!=='left'&&edge!=='right'))return;
    iconAnchors.current.delete(id);
    update(old=>repositionAutoHidePanel(old,id,offset,edge));
  }
  useEffect(()=>{
    const id=layout.autoHideActive;if(!id)return;
    const outside=(event:globalThis.PointerEvent)=>{
      const target=event.target as Element;
      if(refs.current.get(id)?.current?.contains(target)||target.closest('.nearby-panel-rail,.writing-dock,[role="menu"],[role="dialog"],.panel-action-rail,.modal-backdrop,.settings-page'))return;
      update(old=>old.autoHideActive===id?collapseAutoHidePanel(old,id):old);
    };
    document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
  },[layout.autoHideActive]);
  function hide(id:string,minimize:boolean){
    if(id===PRIMARY_EDITOR)return;
    const rect=currentRect(id,true),group=groupFor(id),next=group?.panels.find(value=>value!==id);
    update(old=>hideWorkspacePanel(old,id,rect,minimize,minimize?panelAutoHidePlacement(rect,boundsRef.current,dockedPanels(old.tree).includes(id)):undefined));if(next)onActivate?.(next);
  }
  function floatAt(id:string,rect:Rect){if(!canMovePanel(latest.current,id))return;const fitted=fit(rect,id);update(old=>{const next=releaseAutoHidePanel(detachWorkspacePanel(old,id),id);return {...next,open:next.open.includes(id)?next.open:[...next.open,id],minimized:next.minimized.filter(value=>value!==id),rects:{...next.rects,[id]:fitted}};});raise(id);}
  function dock(id:string,target?:string,edge:DockPlacementEdge='right'){
    if(!canPlacePanel(latest.current,id,target||'',edge))return;
    const fallback=currentRect(target||id,true);update(old=>placeWorkspacePanel(old,id,target||'',edge,fallback));
  }
  function toggleFloat(id:string){if(latest.current.autoHide?.[id]||dockedPanels(latest.current.tree).includes(id))floatAt(id,currentRect(id));else dock(id);}
  function openDocked(id:string){if(isPanelPositionLocked(latest.current,id)){open(id);return;}if(latest.current.locked&&!latest.current.autoHide?.[id]&&!dockedPanels(latest.current.tree).includes(id))return;update(old=>openDockedPanel(old,id,currentRect(id)));onActivate?.(id);}
  function dockAtEdge(id:string,edge:DockEdge){if(!canPlacePanel(latest.current,id,'',edge))return;update(old=>placeWorkspacePanelAtEdge(old,id,edge));raise(id);onActivate?.(id);}
  function splitEditor(id:string,target=PRIMARY_EDITOR,edge:DockEdge='right'){
    if(latest.current.locked||!canPlacePanel(latest.current,id,target,edge)){open(id);return;}
    update(old=>placeWorkspacePanel(old,id,target,edge,suggestedRect(id)));onActivate?.(id);
  }
  function openDocumentTab(id:string,target=PRIMARY_EDITOR){
    update(old=>placeWorkspacePanel(old,id,target,'center',suggestedRect(id)));onActivate?.(id);
  }
  function dockingScene(id:string):DockScene {
    const state=latest.current,docked=dockedPanels(state.tree),grouped=new Set(state.floatingGroups.flatMap(group=>group.panels));
    const floating=state.floatingGroups.map(group=>({id:group.active,rect:fit(state.rects[group.id]||suggestedRect(group.active),group.id),layer:state.layers[group.id]||30}));
    for(const target of state.open)if(target!==id&&!docked.includes(target)&&!grouped.has(target))floating.push({id:target,rect:state.autoHide?.[target]?autoHidePanelRect(state.autoHide[target],boundsRef.current,iconAnchors.current.get(target)):fit(state.rects[target]||suggestedRect(target),target),layer:state.layers[target]||panelLayers.floating});
    return {panel:id,tree:state.tree,bounds:boundsRef.current,viewport:{x:0,y:0,width:window.innerWidth,height:window.innerHeight},floating,scale:headerHeight/PANEL_HEADER_HEIGHT,locked:!!state.locked,positionLockedPanels:state.open.filter(panel=>isPanelPositionLocked(state,panel)),protectedPanels:isEditorPanel(id)?[]:[PRIMARY_EDITOR,...(tabGroups.find(group=>group.panels.includes(PRIMARY_EDITOR))?.panels||[])]};
  }
  function tickDocking(){
    const active=dragIntent.current;if(!active)return;
    const feedback=active.intent.step(active.point,dockingScene(active.id));
    const signature=JSON.stringify([feedback.visible,feedback.guides,feedback.ready?.key,!!active.point.free]);
    if(signature!==active.signature){active.signature=signature;setDockFeedback(feedback);}
  }
  function stopDocking(){
    const active=dragIntent.current;if(active){clearInterval(active.timer);window.removeEventListener('keydown',active.keys,true);window.removeEventListener('keyup',active.keys,true);}
    dragIntent.current=null;setDockFeedback(null);
  }
  function startDocking(id:string,event:globalThis.PointerEvent){
    stopDocking();const point={x:event.clientX,y:event.clientY,free:event.altKey};
    const keys=(event:KeyboardEvent)=>{if(!dragIntent.current||event.key!=='Alt')return;dragIntent.current.point={...dragIntent.current.point,free:event.altKey};tickDocking();};
    dragIntent.current={id,point,intent:new DockIntent(),keys,timer:setInterval(tickDocking,32),signature:''};
    window.addEventListener('keydown',keys,true);window.addEventListener('keyup',keys,true);tickDocking();
  }
  function track(event:PointerEvent<HTMLElement>,move:(dx:number,dy:number,event:globalThis.PointerEvent)=>void,finish?:(event:globalThis.PointerEvent)=>void,onCancel?:()=>void){
    event.preventDefault();cleanup.current?.();const x=event.clientX,y=event.clientY,element=stage.current||event.currentTarget,win=element.ownerDocument.defaultView!;
    // Capture only a real drag: capturing a simple tab press on the stage would
    // redirect its click away from the tab. The stable stage survives tab removal.
    let captured=false;
    const onMove=(e:globalThis.PointerEvent)=>{
      const dx=e.clientX-x,dy=e.clientY-y;
      if(!captured&&Math.hypot(dx,dy)>=5){element.setPointerCapture(event.pointerId);captured=true;}
      move(dx,dy,e);
    };
    const clear=()=>{win.removeEventListener('pointermove',onMove);win.removeEventListener('pointerup',end);win.removeEventListener('pointercancel',cancel);win.removeEventListener('keydown',key,true);win.removeEventListener('blur',cancel);element.removeEventListener('lostpointercapture',cancel);cleanup.current=null;if(element.hasPointerCapture(event.pointerId))element.releasePointerCapture(event.pointerId);};
    const cancel=()=>{clear();onCancel?.();setDragging(null);stopDocking();};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}};
    const end=(e:globalThis.PointerEvent)=>{clear();finish?.(e);};cleanup.current=cancel;
    win.addEventListener('pointermove',onMove);win.addEventListener('pointerup',end);win.addEventListener('pointercancel',cancel);win.addEventListener('keydown',key,true);win.addEventListener('blur',cancel);element.addEventListener('lostpointercapture',cancel);
  }
  function beginDrag(id:string,event:PointerEvent<HTMLElement>,control?:DragControl){
    if(!canMovePanel(latest.current,id))return;
    if(event.button!==0||(!control&&(event.target as Element).closest('button,input,textarea,a,select,[data-no-drag]')))return;
    const start=currentRect(id,control?.fromTab),original=latest.current;let began=false;raise(id);
    track(event,(dx,dy,e)=>{
      if(!began&&Math.hypot(dx,dy)<5)return;if(!began){began=true;control?.onStart?.();setDragging(id);}
      if(dragIntent.current)dragIntent.current.point={x:e.clientX,y:e.clientY,free:e.altKey};
      const rect=fit({...start,x:start.x+dx,y:start.y+dy},id);update(old=>{const next=releaseAutoHidePanel(detachWorkspacePanel(old,id),id);return {...next,rects:{...next.rects,[id]:rect}};});
      if(!dragIntent.current)startDocking(id,e);else tickDocking();
    },event=>{
      if(began&&event.type==='pointerup'){
        const placement=dragIntent.current?.intent.step({x:event.clientX,y:event.clientY,free:event.altKey},dockingScene(id)).ready;
        if(placement?.scope==='workspace')dockAtEdge(id,placement.edge as DockEdge);else if(placement)dock(id,placement.target,placement.edge);onActivate?.(id);
      }
      setDragging(null);stopDocking();control?.onFinish(began||event.type==='pointercancel');
    },()=>{if(began)update(old=>({...old,tree:original.tree,rects:original.rects,floatingGroups:original.floatingGroups,autoHide:original.autoHide,autoHideActive:original.autoHideActive}));control?.onFinish(true);});
  }
  function groupFloat(id:string){const group=groupFor(id);if(!group||group.panels.some(member=>!canMovePanel(latest.current,member)))return;const rect=currentRect(id,true);update(old=>floatWorkspaceGroup(old,group,rect));raise(id);}
  function groupDock(id:string){const group=groupFor(id);if(!group||group.panels.includes(PRIMARY_EDITOR)||group.panels.some(member=>!canPlacePanel(latest.current,member,PRIMARY_EDITOR,'right')))return;const rect=currentRect(id,true);update(old=>placeWorkspaceGroup(old,group,PRIMARY_EDITOR,'right',rect));}
  function beginGroupDrag(id:string,event:PointerEvent<HTMLElement>,control?:DragControl){
    const group=groupFor(id);if(!group||event.button!==0)return;
    const original=latest.current;
    if(group.panels.some(member=>!canMovePanel(original,member)))return;
    const start=currentRect(id,true);let began=false;raise(id);
    track(event,(dx,dy,e)=>{
      if(!began&&Math.hypot(dx,dy)<5)return;
      if(!began){began=true;control?.onStart?.();setDragging(id);}
      const rect=fit({...start,x:start.x+dx,y:start.y+dy},id);
      update(old=>floatWorkspaceGroup(old,group,rect));
      if(dragIntent.current)dragIntent.current.point={x:e.clientX,y:e.clientY,free:e.altKey};
      if(!dragIntent.current)startDocking(id,e);else tickDocking();
    },event=>{
      if(began&&event.type==='pointerup'){
        const placement=dragIntent.current?.intent.step({x:event.clientX,y:event.clientY,free:event.altKey},dockingScene(id)).ready;
        if(placement&&!group.panels.includes(placement.target||'')&&group.panels.every(member=>canPlacePanel(latest.current,member,placement.target||'',placement.edge))){
          update(old=>placeWorkspaceGroup(old,group,placement.target||'',placement.edge,currentRect(id,true),placement.scope==='workspace'));
        }
      }
      setDragging(null);stopDocking();control?.onFinish(began||event.type==='pointercancel');
    },()=>{if(began)update(()=>original);control?.onFinish(true);});
  }
  function resize(id:string,event:PointerEvent<HTMLElement>,edge:string){
    if(event.button!==0)return;
    event.stopPropagation();const start=currentRect(id,true),original=latest.current,startTree=original.tree,docked=dockedPanels(startTree).includes(id),edgeMap=dockResizeEdges(startTree,id);
    const autoHide=original.autoHide?.[id];
    if(!isFreelyMovableTool(original,id)&&(isPanelPositionLocked(original,id)||original.locked&&docked))return;
    if(autoHide){
      track(event,(dx,dy)=>{
        const width=Math.max(120,Math.min(boundsRef.current.width,start.width+(edge==='w'?-dx:edge==='e'?dx:0)));
        const height=Math.max(80,Math.min(boundsRef.current.height,start.height+(edge==='n'?-dy:edge==='s'?dy:0)));
        update(old=>({...old,autoHide:{...old.autoHide,[id]:{...autoHide,rect:{...autoHide.rect,width,height}}},rects:{...old.rects,[id]:{...autoHide.rect,width,height}}}));
      },undefined,()=>update(old=>({...old,autoHide:original.autoHide,rects:original.rects})));return;
    }
    const group=original.floatingGroups.find(value=>value.panels.includes(id)),key=group?.id||id,requested:string[]=[];
    if(edge.includes('w'))requested.push('left');if(edge.includes('e'))requested.push('right');if(edge.includes('n'))requested.push('top');if(edge.includes('s'))requested.push('bottom');
    const dividers=measureDockTree(startTree,{x:0,y:0,width:bounds.width,height:bounds.height}).dividers,plans=requested.map(value=>dividers.find(divider=>divider.id===edgeMap?.[value as keyof typeof edgeMap]));
    if(docked&&plans.some(divider=>divider&&!canResizeSplit(original,divider.id)))return;
    if(docked&&!plans.some(Boolean))return;
    raise(id);
    const resizeDocked=docked;
    track(event,(dx,dy)=>{
      if(Math.hypot(dx,dy)<2)return;
      if(resizeDocked){let tree=startTree;for(const divider of plans){if(!divider)continue;const extent=(divider.axis==='x'?divider.parent.width:divider.parent.height)-5;tree=resizeDockSplit(tree,divider.id,divider.ratio+(divider.axis==='x'?dx:dy)/Math.max(1,extent));}update(old=>({...old,tree}));return;}
      const rect=fit(resizeFloatingRect(start,edge,dx,dy,viewport()),id);
      update(old=>({...old,rects:{...old.rects,[key]:rect}}));
    },undefined,()=>update(old=>({...old,tree:original.tree,rects:original.rects,floatingGroups:original.floatingGroups})));
  }
  function handles(id:string){if(!isFreelyMovableTool(layout,id)&&(isPanelPositionLocked(layout,id)||layout.locked&&dockedPanels(layout.tree).includes(id)))return null;const hidden=layout.autoHide?.[id];const edges=hidden?[({left:'e',right:'w',top:'s',bottom:'n'} as const)[hidden.edge]]:['n','s','e','w','ne','nw','se','sw'];return <>{edges.map(edge=><div key={edge} data-resize-edge={edge} className={'panel-resize panel-resize-'+edge} aria-label={`调整面板大小 ${edge}`} onPointerDown={event=>resize(id,event,edge)}/>)}</>;}
  function panel(id:string){
    const autoHide=layout.autoHide?.[id],peek=!!autoHide&&layout.autoHideActive===id;
    const group=groupFor(id),floating=!measurements.panels[id]&&!autoHide,frame=peek?autoHidePanelRect(autoHide!,bounds,iconAnchors.current.get(id)):group?.rect||measurements.panels[id]||fit(layout.rects[id]||suggestedRect(id),id);
    const rect=group?{...frame,y:frame.y+headerHeight,height:Math.max(0,frame.height-headerHeight)}:frame;
    const style:CSSProperties={position:floating||peek?'fixed':'absolute',left:rect.x,top:rect.y,width:rect.width,height:rect.height,minWidth:0,minHeight:0,flex:'none',display:layout.open.includes(id)&&(!group||group.active===id)?undefined:'none',zIndex:peek||floating?layout.layers[group?.id||id]||panelLayers.floating:panelLayers.docked,boxShadow:peek?'0 8px 28px #0008':undefined,borderTopLeftRadius:group?0:undefined,borderTopRightRadius:group?0:undefined};
    return {ref:refFor(id),floating,movable:canMovePanel(layout,id),primary:id===PRIMARY_EDITOR,positionLocked:isPanelPositionLocked(layout,id),lockHint:isPanelPositionLocked(layout,id)?((isFreelyMovableTool(layout,id)?"停靠位置已锁定，浮窗可移动和缩放 · ":"位置已锁定 · ")+(lockGesture==="longPress"?"长按":"双击")+"标题栏解锁"):(lockGesture==="longPress"?"长按标题栏锁定位置":"双击标题栏锁定位置"),canDock:!layout.locked&&!isPanelPositionLocked(layout,id)&&id!==PRIMARY_EDITOR,autoHidden:!!autoHide,collapseEdge:autoHide?.edge||nearestPanelEdge({...frame,x:frame.x+(floating?0:bounds.x),y:frame.y+(floating?0:bounds.y)},bounds,!floating),grouped:!!group,style,raise:()=>raise(id),beginDrag:(event:PointerEvent<HTMLElement>,control?:DragControl)=>beginDrag(id,event,control),toggleFloat:()=>toggleFloat(id),floatAt:(rect:Rect)=>floatAt(id,rect),openDocked:()=>openDocked(id),openFloating:()=>floatAt(id,fit(latest.current.rects[id]||suggestedRect(id),id)),dock:()=>dock(id),dockAtEdge:(edge:DockEdge)=>dockAtEdge(id,edge),close:()=>hide(id,false),minimize:()=>hide(id,true),handles:group?null:handles(id),groupHandles:group?handles(id):null};
  }
  const chrome=<>
    {measurements.dividers.map(divider=><div key={divider.id} className={'workspace-divider axis-'+divider.axis+(!canResizeSplit(layout,divider.id)?' layout-locked':'')} role="separator" aria-disabled={!canResizeSplit(layout,divider.id)} tabIndex={canResizeSplit(layout,divider.id)?0:-1} aria-label={divider.axis==='x'?'调整左右面板比例':'调整上下面板比例'} aria-orientation={divider.axis==='x'?'vertical':'horizontal'} aria-valuenow={Math.round(divider.ratio*100)} aria-valuemin={12} aria-valuemax={88} style={{left:divider.rect.x,top:divider.rect.y,width:divider.rect.width,height:divider.rect.height}}
      onKeyDown={event=>{if(!canResizeSplit(latest.current,divider.id))return;const keys=divider.axis==='x'?['ArrowLeft','ArrowRight']:['ArrowUp','ArrowDown'];if(keys.includes(event.key)){event.preventDefault();update(old=>({...old,tree:resizeDockSplit(old.tree,divider.id,divider.ratio+(event.key===keys[0]?-.02:.02))}));}}}
      onPointerDown={event=>{if(!canResizeSplit(latest.current,divider.id))return;event.stopPropagation();const original=latest.current.tree;track(event,(dx,dy)=>{const extent=(divider.axis==='x'?divider.parent.width:divider.parent.height)-5;update(old=>({...old,tree:resizeDockSplit(old.tree,divider.id,divider.ratio+(divider.axis==='x'?dx:dy)/Math.max(1,extent))}));},undefined,()=>update(old=>({...old,tree:original})));}}/>)}
    {dragging&&createPortal(<DockGuides feedback={dockFeedback} free={!!dragIntent.current?.point.free} locked={!!layout.locked}
      label={dockFeedback?.target?refFor(dockFeedback.target.id).current?.getAttribute('aria-label')||'目标面板':''}
      draggedLabel={refFor(dragging).current?.getAttribute('aria-label')||'面板'}
      tabs={(tabGroups.find(group=>group.panels.includes(dockFeedback?.target?.id||''))?.panels.filter(id=>id!==dragging)||[dockFeedback?.target?.id||'']).map(id=>refFor(id).current?.getAttribute('aria-label')||'目标面板')}/>,document.body)}
  </>;
  return {panel,beginGroupDrag,groupFloat,groupDock,canPullRail:(edge:'left'|'right')=>canDockAutoHideRail(layout,edge),dockAutoHideRail:(edge:'left'|'right',width:number)=>update(old=>dockAutoHideRail(old,edge,width,boundsRef.current.width)),closePreservingAutoHide:(id:string)=>{if(id===PRIMARY_EDITOR)return;const rect=currentRect(id,true);update(old=>closeWorkspacePanelPreservingAutoHide(old,id,rect));},open,splitEditor,openDocumentTab,isPositionLocked:(id:string)=>isPanelPositionLocked(layout,id),togglePositionLock,locked:!!layout.locked,toggleLocked:()=>{cleanup.current?.();stopDocking();update(old=>({...old,locked:!old.locked}));},close:(id:string)=>hide(id,false),minimize:(id:string)=>hide(id,true),toggle:(id:string)=>layout.open.includes(id)?hide(id,false):open(id),isOpen:(id:string)=>layout.open.includes(id),chrome,
    capture:()=>structuredClone(latest.current),
    restoreLayout:(saved:WorkspaceLayout)=>{
      if(latest.current.locked)throw new Error('请先解锁工作区位置，再应用其他视图。');
      cleanup.current?.();setDragging(null);stopDocking();iconAnchors.current.clear();
      const next=structuredClone(saved);next.rects=Object.fromEntries(Object.entries(next.rects).map(([id,rect])=>[id,fit(rect,id,next)]));
      const normalized=normalize(next,boundsRef.current);latest.current=normalized;setLayout(normalized);
    },
    reset:()=>{if(latest.current.locked)return;const next=defaultWorkspace();latest.current=next;setLayout(next);},openIds:layout.open,minimizedIds:layout.minimized,toggleAutoHide,repositionAutoHide,openDocked,autoHideItems:Object.entries(layout.autoHide||{}).map(([id,placement])=>({id,edge:placement.edge,offset:placement.offset,active:layout.autoHideActive===id})),tabGroups:tabGroups.map(group=>({...group,style:{position:group.floating?'fixed':'absolute',left:group.rect.x,top:group.rect.y,width:group.rect.width,height:group.rect.height,zIndex:group.floating?(layout.layers[group.id]||panelLayers.floating)+1:panelLayers.tabs} as CSSProperties}))};
}
