import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {createPortal} from 'react-dom';
import './rail-edge-handle.css';
export default function RailEdgeHandle({edge,scale,disabled,onCommit}:{edge:'left'|'right';scale:number;disabled:boolean;onCommit:(width:number)=>void}){
  const cleanup=useRef<(()=>void)|null>(null),[preview,setPreview]=useState<{left:number;top:number;width:number;height:number;ready:boolean}|null>(null);
  useEffect(()=>()=>cleanup.current?.(),[]);
  function start(event:ReactPointerEvent<HTMLDivElement>){
    if(disabled||event.button!==0||!event.isPrimary)return;
    event.preventDefault();event.stopPropagation();cleanup.current?.();
    const handle=event.currentTarget,parent=handle.closest('.nearby-workbench-middle');if(!parent)return;
    const bounds=parent.getBoundingClientRect(),startX=event.clientX,pointer=event.pointerId;let distance=0;
    const move=(e:PointerEvent)=>{if(e.pointerId!==pointer)return;distance=Math.max(0,(e.clientX-startX)*(edge==='left'?1:-1));const width=Math.min(bounds.width*.4,Math.max(Math.min(120,bounds.width*.4),distance));setPreview({left:edge==='left'?startX:startX-width,top:bounds.top,width,height:bounds.height,ready:distance>=64*scale});};
    const clear=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancelEvent);window.removeEventListener('keydown',key,true);window.removeEventListener('blur',cancel);handle.removeEventListener('lostpointercapture',lost);if(handle.hasPointerCapture(pointer))handle.releasePointerCapture(pointer);cleanup.current=null;setPreview(null);};
    const cancel=()=>clear();const cancelEvent=(e:PointerEvent)=>{if(e.pointerId===pointer)cancel();};const lost=(e:PointerEvent)=>{if(e.pointerId===pointer)cancel();};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}};
    const up=(e:PointerEvent)=>{if(e.pointerId!==pointer)return;if(!e.isPrimary){clear();return;}distance=Math.max(0,(e.clientX-startX)*(edge==='left'?1:-1));const width=Math.min(bounds.width*.4,Math.max(Math.min(120,bounds.width*.4),distance));const inside=e.clientX>=bounds.left&&e.clientX<=bounds.right&&e.clientY>=bounds.top&&e.clientY<=bounds.bottom&&e.clientX>=0&&e.clientX<=window.innerWidth&&e.clientY>=0&&e.clientY<=window.innerHeight;clear();if(inside&&distance>=64*scale)onCommit(width);};
    cleanup.current=cancel;window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancelEvent);window.addEventListener('keydown',key,true);window.addEventListener('blur',cancel);handle.addEventListener('lostpointercapture',lost);handle.setPointerCapture(pointer);
  }
  return <><div className={'rail-edge-handle edge-'+edge} role="separator" aria-label={`拖动${edge==='left'?'左':'右'}侧栏边缘创建固定分区`} aria-disabled={disabled} onPointerDown={start}/>{preview&&createPortal(<div className={'rail-pull-preview'+(preview.ready?' ready':'')} style={{left:preview.left,top:preview.top,width:preview.width,height:preview.height}}><span>{preview.ready?'松手创建固定分区':'继续拖动创建固定分区'}</span></div>,document.body)}</>;
}
