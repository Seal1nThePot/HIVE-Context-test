import {usePanelDocument} from '../../shared/panelDocument';
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ListTree, PencilLine, Sparkles, WandSparkles } from "../../shared/icons";
import { modeLabels, type Mode } from "../../shared/core";
export default function WritingModeControl({mode,onMode}:{mode:Mode;onMode:(mode:Mode)=>void}){
  const document=usePanelDocument(),window=document.defaultView!;
  const [open,setOpen]=useState(false),[position,setPosition]=useState({x:0,y:0});
  const anchor=useRef<HTMLButtonElement|null>(null),menu=useRef<HTMLDivElement>(null);
  const icons={discuss:Sparkles,outline:ListTree,edit:WandSparkles,continue:PencilLine};
  const Icon=icons[mode];
  useEffect(()=>{
    if(!open)return;
    menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const outside=(event:globalThis.PointerEvent)=>{if(!menu.current?.contains(event.target as Node)&&!anchor.current?.contains(event.target as Node))setOpen(false);};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);anchor.current?.focus();}};
    const close=()=>setOpen(false);
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);window.addEventListener('resize',close);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);window.removeEventListener('resize',close);};
  },[open,document,window]);
  return <><button ref={anchor} className="writing-mode-trigger" aria-label="切换写作模式" title="点击切换写作模式" aria-haspopup="menu" aria-expanded={open} onDoubleClick={event=>event.stopPropagation()} onClick={event=>{
    const rect=event.currentTarget.getBoundingClientRect();
    setPosition({x:Math.max(8,Math.min(window.innerWidth-208,rect.left)),y:rect.bottom+205<window.innerHeight?rect.bottom+6:Math.max(8,rect.top-205)});setOpen(value=>!value);
  }}><Icon size={17}/></button>
  {open&&createPortal(<div ref={menu} className="panel-control-menu writing-mode-menu" role="menu" aria-label="切换写作模式" style={{left:position.x,top:position.y}} onKeyDown={event=>{
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();
    const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button')),index=buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();
  }}><small>写作模式</small>{(Object.keys(modeLabels) as Mode[]).map(value=>{const ItemIcon=icons[value];return <button key={value} role="menuitemradio" aria-checked={mode===value} onClick={()=>{setOpen(false);onMode(value);}}><ItemIcon size={14}/>{modeLabels[value]}{mode===value&&<Check size={12} className="selected-mode-check"/>}</button>;})}</div>,document.body)}
  </>;
}
