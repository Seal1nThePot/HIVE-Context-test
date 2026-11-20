import {createContext,useCallback,useContext,useState,useEffect,useRef,type ReactNode} from 'react';

export type MarkedDocument={sessionId:string;file:string};
export type WindowMark={id:string;workspaceId:string;document?:MarkedDocument};
const WindowAnnotations=createContext<{
  markedPanels:readonly string[];
  marks:readonly WindowMark[];
  remove:(mark:WindowMark)=>void;
  clear:()=>void;
  toggle:(mark:WindowMark)=>void;
}>({markedPanels:[],marks:[],remove:()=>{},clear:()=>{},toggle:()=>{}});
export const useWindowAnnotations=()=>useContext(WindowAnnotations);

export function WindowAnnotationProvider({children}:{children:ReactNode}){
  const [marks,setMarks]=useState<WindowMark[]>([]);
  const remove=useCallback((mark:WindowMark)=>setMarks(old=>old.filter(current=>current!==mark)),[]);
  const toggle=useCallback((mark:WindowMark)=>setMarks(old=>{
    const current=old.find(item=>item.id===mark.id);
    if(!current)return [...old,mark];
    const a=current.document,b=mark.document;
    if(current.workspaceId===mark.workspaceId&&a?.sessionId===b?.sessionId&&a?.file===b?.file)return old.filter(item=>item!==current);
    return old.map(item=>item===current?mark:item);
  }),[]);
  return <WindowAnnotations.Provider value={{
    marks,markedPanels:marks.map(mark=>mark.id),remove,clear:()=>setMarks([]),toggle,
  }}>{children}</WindowAnnotations.Provider>;
}

export function windowAnnotationTarget(target:Element){
  const tab=target.closest<HTMLElement>('[data-panel-tab]');
  if(tab?.dataset.panelTab)return tab.dataset.panelTab;
  if(target.closest('button,a,input,textarea,select,[role="button"],[contenteditable],[data-no-drag]'))return;
  const title=target.closest<HTMLElement>('.panel-drag-header');
  return title?.dataset.lockPanel||title?.closest<HTMLElement>('[data-panel-id]')?.dataset.panelId;
}

export function useWindowAnnotationGesture(windows:ReadonlyMap<string,Window>,captureMark:(panel:string)=>WindowMark){
  const {toggle}=useWindowAnnotations();
  const capture=useRef(captureMark);capture.current=captureMark;
  useEffect(()=>{
    const cleanups=[...new Set([window,...windows.values()])].map(owner=>{
      let press:{mark:WindowMark;pointer:number;x:number;y:number;cancelled:boolean}|undefined;
      const identify=(event:MouseEvent)=>{
        const target=event.target as Element|null;
        return event.ctrlKey&&!event.altKey&&!event.shiftKey&&!event.metaKey&&event.button===0&&target?.nodeType===1?windowAnnotationTarget(target):undefined;
      };
      const down=(event:PointerEvent)=>{
        press=undefined;
        const id=event.isPrimary?identify(event):undefined;
        if(!id)return;
        press={mark:capture.current(id),pointer:event.pointerId,x:event.clientX,y:event.clientY,cancelled:false};
        event.preventDefault();
        event.stopPropagation();
      };
      const move=(event:PointerEvent)=>{
        if(press?.pointer===event.pointerId&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>5)press.cancelled=true;
      };
      const click=(event:MouseEvent)=>{
        const initial=press;
        press=undefined;
        if(!initial||initial.mark.id!==identify(event)||!event.detail)return;
        event.preventDefault();
        event.stopPropagation();
        if(!initial.cancelled&&Math.hypot(event.clientX-initial.x,event.clientY-initial.y)<=5)toggle(initial.mark);
      };
      const cancel=()=>{press=undefined;};
      owner.addEventListener('pointerdown',down,true);
      owner.addEventListener('pointermove',move,true);
      owner.addEventListener('click',click,true);
      owner.addEventListener('pointercancel',cancel);
      owner.addEventListener('blur',cancel);
      return ()=>{
        owner.removeEventListener('pointerdown',down,true);
        owner.removeEventListener('pointermove',move,true);
        owner.removeEventListener('click',click,true);
        owner.removeEventListener('pointercancel',cancel);
        owner.removeEventListener('blur',cancel);
      };
    });
    return ()=>cleanups.forEach(cleanup=>cleanup());
  },[windows,toggle]);
}
