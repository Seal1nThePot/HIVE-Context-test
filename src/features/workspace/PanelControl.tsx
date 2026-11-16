import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsDown, ChevronsLeft, ChevronsRight, ChevronsUp, Maximize2, Menu, PanelLeftOpen, X } from "lucide-react";
import type {DockEdge} from "./panelLayout";
import { placePanelActions } from "./panelUiGeometry";
export type DragControl = { onStart?: () => void; onFinish: (dragged: boolean) => void; fromTab?:boolean };
export type PanelAction = { label: string; icon?: ReactNode; run: () => void; disabled?:boolean; checked?:boolean };
export default function PanelControl({ label, floating, onToggleFloat, onOpen, onClose, onMinimize, collapseEdge, primary=false, movable=true, canDock=true, actions=[], memberActions }: {
  label: string; floating: boolean;
  onToggleFloat: () => void; onOpen:()=>void;onClose: () => void;
  onMinimize:()=>void;collapseEdge?:DockEdge;primary?:boolean;movable?:boolean;canDock?:boolean;
  actions?:PanelAction[];memberActions?:PanelAction[];
}) {
  const [open, setOpen] = useState(false), [position, setPosition] = useState({x:0,y:0,width:158,height:30,orientation:"horizontal"});
  const button = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const CollapseIcon=collapseEdge?({left:ChevronsLeft,right:ChevronsRight,top:ChevronsUp,bottom:ChevronsDown})[collapseEdge]:ChevronsLeft;
  const choices: PanelAction[] = [
    ...actions,
    {label:memberActions?'整组浮动':'浮动面板',icon:<Maximize2 size={14}/>,run:onToggleFloat,disabled:primary||floating||!movable},
    ...(memberActions?[{label:'整组收纳',run:onMinimize,disabled:primary}]:[]),
    {label:memberActions?'整组关闭':'关闭面板',icon:<X size={14}/>,run:onClose,disabled:primary},
    {label:memberActions?'整组打开停靠':'打开面板',icon:<PanelLeftOpen size={14}/>,run:onOpen,disabled:primary||!canDock},
    ...(memberActions||[]),
  ];
  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const rect = button.current.getBoundingClientRect();
    const scale=Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'))||1;
    const textScale=Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--text-scale'))||1;
    setPosition(placePanelActions({x:rect.x,y:rect.y,width:rect.width,height:rect.height},{width:window.innerWidth,height:window.innerHeight},choices.length+(memberActions?1:0),scale,textScale));
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [open, choices.length]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: globalThis.PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if(event.key==='Escape'){setOpen(false);button.current?.focus();} };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown',outside); document.addEventListener('keydown',escape);
    window.addEventListener('resize',close);
    return () => {document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);window.removeEventListener('resize',close);};
  },[open]);
  return <div className="panel-controls" data-no-drag onPointerDown={event=>event.stopPropagation()} onDoubleClick={event=>event.stopPropagation()}>
    {!primary&&<button type="button" className="panel-mini-button" aria-label={`收纳${label}面板`} title="收纳面板" onClick={onMinimize}><CollapseIcon size={11}/></button>}
    {floating&&<button type="button" className="panel-mini-button panel-close-button" aria-label={`关闭${label}面板`} title="关闭面板" onClick={onClose}><X size={11}/></button>}
    <button type="button" ref={button} className="panel-mini-button panel-menu-button" data-panel-control aria-label={`${label}面板功能`}
      title="面板功能 · 单击展开" aria-haspopup="menu" aria-expanded={open}
      onClick={()=>setOpen(value=>!value)}
      onContextMenu={event=>event.preventDefault()}
      >
      <Menu size={11}/>
    </button>
    {open&&createPortal(<div ref={menu} className="panel-action-rail vertical" role="menu" aria-label={`${label}面板操作`} style={{left:position.x,top:position.y,width:position.width,maxHeight:position.height}}
      onContextMenu={event=>event.preventDefault()}
      onKeyDown={event=>{
        const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
        const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
        if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
          event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();
        } else if(event.key==='Tab'){setOpen(false);}
      }}>
      {choices.map((choice,index)=><Fragment key={choice.label}>{memberActions&&index===choices.length-memberActions.length&&<div className="panel-actions-section" role="presentation">当前窗口：{label}</div>}<button type="button" role={choice.checked===undefined?'menuitem':'menuitemcheckbox'} aria-checked={choice.checked} disabled={choice.disabled} key={choice.label} onClick={()=>{setOpen(false);button.current?.focus();choice.run();}}>{choice.icon}<span>{choice.label}</span>{choice.checked&&<Check className="panel-action-check" size={14}/>}</button></Fragment>)}
    </div>,document.body)}
  </div>;
}
