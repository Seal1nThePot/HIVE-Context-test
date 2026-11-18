import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {flattenEntries,type Entry} from './explorerState';
import './file-picker.css';

export default function FilePicker({entries,onOpen,onClose}:{entries:Entry[];onOpen:(path:string)=>Promise<void>;onClose:()=>void}){
  const modal=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null),opening=useRef(false),prefix=useId();
  const [query,setQuery]=useState(''),[index,setIndex]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const files=useMemo(()=>flattenEntries(entries).filter(item=>item.type==='file'),[entries]);
  const matches=files.filter(item=>item.path.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),selected=Math.min(index,Math.max(0,matches.length-1));
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;modal.current?.showModal();input.current?.focus();return()=>{modal.current?.close();if(previous?.isConnected)previous.focus({preventScroll:true});};},[]);
  useEffect(()=>{document.getElementById(prefix+'-'+selected)?.scrollIntoView({block:'nearest'});},[selected,query,prefix]);
  async function open(path:string){if(opening.current)return;opening.current=true;setBusy(true);setError('');try{await onOpen(path);onClose();}catch(error){setError((error as Error).message);}finally{opening.current=false;setBusy(false);}}
  return createPortal(<dialog ref={modal} className="workspace-file-picker" aria-label="最近使用" onCancel={event=>{event.preventDefault();if(!opening.current)onClose();}} onClick={event=>{if(event.target===event.currentTarget&&!opening.current)onClose();}}>
    <div className="file-picker-content">
      <div className="file-picker-search"><input ref={input} aria-label="筛选最近使用的文件" placeholder="筛选最近使用的文件…" value={query} disabled={busy} role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls={prefix+'-list'} aria-activedescendant={matches.length?prefix+'-'+selected:undefined} onChange={event=>{setQuery(event.target.value);setIndex(0);}} onKeyDown={event=>{
        if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&matches.length){event.preventDefault();setIndex(event.key==='Home'?0:event.key==='End'?matches.length-1:(selected+(event.key==='ArrowDown'?1:matches.length-1))%matches.length);}
        if(event.key==='Enter'&&matches[selected]){event.preventDefault();void open(matches[selected].path);}
      }}/><button type="button" className="file-picker-close" aria-label="关闭最近使用" disabled={busy} onClick={onClose}><X size={13}/></button></div>
      <div className="file-picker-list" role="listbox" aria-label="最近打开的文件" id={prefix+'-list'} aria-busy={busy}>
        {matches.map((item,i)=><button type="button" key={item.path} id={prefix+'-'+i} role="option" aria-selected={i===selected} tabIndex={-1} disabled={busy} title={item.path} onPointerMove={()=>setIndex(i)} onClick={()=>void open(item.path)}>{item.path}</button>)}
        {!matches.length&&<p>{files.length?'没有匹配的文件':'当前仓库还没有最近打开的文件。'}</p>}
      </div>
      {error&&<p className="file-picker-error" role="alert">{error}</p>}
      <div className="file-picker-hint"><span><kbd>↑↓</kbd> 选择</span><span><kbd>↵</kbd> 打开</span><span><kbd>Esc</kbd> 取消</span></div>
    </div>
  </dialog>,document.body);
}
