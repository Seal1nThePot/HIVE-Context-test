import {useEffect,useLayoutEffect,useRef,useState,type ReactNode,type MouseEvent,type FocusEvent} from 'react';
import {createPortal} from 'react-dom';

type Active={button:HTMLButtonElement;text:string};
export function DockTooltip({children}:{children:ReactNode}){
  const [active,setActive]=useState<Active|null>(null),tip=useRef<HTMLDivElement>(null);
  const hide=()=>setActive(null);
  function show(target:EventTarget|null){
    const element=target as Element|null, button=element?.closest?.('button[data-tooltip]') as HTMLButtonElement|null;
    if(button?.dataset.tooltip){const text=button.dataset.tooltip;setActive(old=>old?.button===button&&old.text===text?old:{button,text});}
  }
  useEffect(()=>{
    if(!active)return;
    const doc=active.button.ownerDocument,view=doc.defaultView;
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')hide();};
    doc.addEventListener('keydown',key);view?.addEventListener('blur',hide);view?.addEventListener('resize',hide);
    return()=>{doc.removeEventListener('keydown',key);view?.removeEventListener('blur',hide);view?.removeEventListener('resize',hide);};
  },[active]);
  useEffect(()=>()=>window.hiveDesktop?.dockTooltip(null),[]);
  useLayoutEffect(()=>{
    const node=tip.current;if(!active||!node){window.hiveDesktop?.dockTooltip(null);return;}
    const doc=active.button.ownerDocument,view=doc.defaultView;if(!view)return;
    const rect=active.button.getBoundingClientRect(),width=node.offsetWidth,height=node.offsetHeight;
    const native=doc!==document&&!!window.hiveDesktop?.isDesktop;
    if(native){
      const style=view.getComputedStyle(node);
      window.hiveDesktop?.dockTooltip({id:'global-toolbar',text:active.text,anchor:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},width,height,background:style.backgroundColor,color:style.color,border:style.borderTopColor,fontSize:parseFloat(style.fontSize)});
    }else{
      const left=Math.max(0,Math.min(view.innerWidth-width,rect.left+rect.width/2-width/2));
      const top=rect.top-height-12>=0?rect.top-height-12:Math.min(view.innerHeight-height,rect.bottom+12);
      node.style.left=`${left}px`;node.style.top=`${Math.max(0,top)}px`;node.style.visibility='visible';
    }
    return()=>window.hiveDesktop?.dockTooltip(null);
  },[active]);
  const over=(event:MouseEvent<HTMLDivElement>)=>show(event.target);
  const out=(event:MouseEvent<HTMLDivElement>)=>{const from=(event.target as Element).closest?.('button[data-tooltip]'),to=(event.relatedTarget as Element|null)?.closest?.('button[data-tooltip]');if(from&&from!==to)hide();};
  const focus=(event:FocusEvent<HTMLDivElement>)=>show(event.target);
  return <div style={{display:'contents'}} onMouseOver={over} onMouseOut={out} onFocus={focus} onBlur={hide} onClickCapture={hide}>{children}{active&&createPortal(<div ref={tip} className="dock-tooltip" style={{left:0,top:0,visibility:'hidden'}}>{active.text}</div>,active.button.ownerDocument.body)}</div>;
}
