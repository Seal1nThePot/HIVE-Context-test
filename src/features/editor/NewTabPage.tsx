import {useEffect,useRef} from 'react';
import {DocumentsPanel,Icon,Plus} from "../../shared/icons";
import './new-tab.css';

export function NewTabButton({onClick,disabled=false}:{onClick:()=>void;disabled?:boolean}){
  return <button type="button" className="document-new-tab" aria-label="新建标签页" title="新建标签页" disabled={disabled}
    onPointerDown={event=>event.stopPropagation()} onDoubleClick={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();onClick();}}><Plus size={14}/></button>;
}

export default function NewTabPage({active,busy,onCreate,onOpen}:{active:boolean;busy:boolean;onCreate:()=>void;onOpen:()=>void}){
  const page=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(active)page.current?.focus({preventScroll:true});},[active]);
  return <div ref={page} className="document-new-page" tabIndex={-1} aria-label="新标签页" aria-busy={busy}>
    <div className="new-tab-actions">
      <button type="button" disabled={busy} onClick={onCreate} aria-keyshortcuts="Control+N"><Icon name="file.newNote" size={17}/><span>新建笔记</span><kbd>Ctrl + N</kbd></button>
      <button type="button" onClick={onOpen} aria-keyshortcuts="Control+O"><DocumentsPanel size={17}/><span>打开文件</span><kbd>Ctrl + O</kbd></button>
    </div>
  </div>;
}
