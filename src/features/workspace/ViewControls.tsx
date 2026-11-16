import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,FolderOpen,Save,SquarePen,Trash2,X} from 'lucide-react';
import {modeLabels,type Mode} from '../../shared/core';
import {useViewPresets} from './useViewPresets';
import type {ViewPreset,ViewSnapshot} from './viewPresets';
import './view-presets.css';

export default function ViewControls({mode,workspaceId,onCapture,onApply}:{mode:Mode;workspaceId:string;onCapture:()=>ViewSnapshot;onApply:(view:ViewPreset)=>Promise<void>}){
  const store=useViewPresets(workspaceId),[selected,setSelected]=useState<Partial<Record<Mode,string>>>({}),[dialog,setDialog]=useState<'save'|'rename'|'remove'|null>(null),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const views=store.views.filter(view=>view.mode===mode),current=views.find(view=>view.id===selected[mode]);
  const panel=useRef<HTMLDivElement>(null),returnFocus=useRef<HTMLElement|null>(null);
  useEffect(()=>{setError('');setNotice('');setDialog(null);},[mode]);
  useEffect(()=>{
    if(!dialog)return;returnFocus.current=document.activeElement as HTMLElement;
    const siblings=Array.from(panel.current?.parentElement?.children||[]).filter(el=>el!==panel.current&&el instanceof HTMLElement) as HTMLElement[];
    const inert=siblings.map(el=>el.inert);siblings.forEach(el=>{el.inert=true;});
    (panel.current?.querySelector('input')||panel.current?.querySelector('button'))?.focus();
    return()=>{siblings.forEach((el,index)=>{el.inert=inert[index];});returnFocus.current?.focus();};
  },[dialog]);
  function run(action:()=>void,message:string){setError('');try{action();setNotice(message);return true;}catch(error){setError((error as Error).message);return false;}}
  return <div className="view-controls" aria-label="当前模式的保存视图">
    <div className="view-mode"><b>{modeLabels[mode]}</b><small>此模式下的视图</small></div>
    <label className="saved-view-select"><span>保存的视图</span><select aria-label="保存的视图" disabled={busy} value={current?.id||''} onChange={event=>{setSelected({...selected,[mode]:event.target.value});setNotice('');setError('');}}><option value="">{views.length?'选择一个视图…':'尚未保存视图'}</option>{views.map(view=><option key={view.id} value={view.id}>{view.name}</option>)}</select></label>
    <div className="view-actions">
      <button type="button" disabled={busy} onClick={()=>{setName(`${modeLabels[mode]} ${views.length+1}`);setError('');setDialog('save');}}><Save size={16}/><span>保存为新视图</span></button>
      <button type="button" disabled={!current||busy} onClick={async()=>{if(!current)return;setBusy(true);setError('');setNotice('');try{await onApply(current);setNotice(`已应用「${current.name}」`);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}><FolderOpen size={16}/><span>{busy?'应用中…':'应用视图'}</span></button>
      <button type="button" disabled={!current||busy} onClick={()=>{if(current)run(()=>{store.save(current.name,mode,onCapture(),current.id);},`已更新「${current.name}」`);}}><Check size={16}/><span>更新所选视图</span></button>
      <button type="button" disabled={!current||busy} onClick={()=>{if(current){setName(current.name);setError('');setDialog('rename');}}}><SquarePen size={16}/><span>重命名</span></button>
      <button type="button" disabled={!current||busy} onClick={()=>{setError('');setDialog('remove');}}><Trash2 size={16}/><span>删除视图</span></button>
    </div>
    {(error||store.error||notice)&&<span className={'view-feedback '+(error||store.error?'error':'')} role={error||store.error?'alert':'status'}>{error||store.error||notice}</span>}
    {dialog&&createPortal(<div ref={panel} className="modal-backdrop view-modal-backdrop" role="dialog" aria-modal="true" aria-label={dialog==='remove'?'删除视图':dialog==='rename'?'重命名视图':'保存当前视图'} onKeyDown={event=>{
      if(event.key==='Escape'){event.stopPropagation();setDialog(null);}
      if(event.key==='Tab'){
        const nodes=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button,input')),first=nodes[0],last=nodes.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    }}><form className="modal small-modal view-name-form" onSubmit={event=>{event.preventDefault();
      const message=dialog==='remove'?'视图已删除。':dialog==='rename'?'视图名称已更新。':'当前视图已保存。';
      if(run(()=>{
        if(dialog==='remove'&&current){store.remove(current.id);setSelected({...selected,[mode]:''});}
        else if(dialog==='rename'&&current)store.rename(current.id,name);
        else if(dialog==='save'){const id=store.save(name,mode,onCapture());setSelected({...selected,[mode]:id});}
      },message))setDialog(null);
    }}><div className="simple-modal-heading"><h2>{dialog==='remove'?'删除视图':dialog==='rename'?'重命名视图':'保存当前视图'}</h2><button type="button" className="icon-button" aria-label="关闭视图操作" onClick={()=>setDialog(null)}><X size={18}/></button></div>
      {dialog==='remove'?<p>删除「{current?.name}」的保存记录？当前面板和正文继续保留。</p>:<><label>视图名称<input aria-label="视图名称" value={name} maxLength={80} required onChange={event=>setName(event.target.value)}/></label><p>{modeLabels[mode]} · 保存面板布局、显示项和文字/UI 大小。</p><small>正文仍以当前文件为准，视图不保存旧文本或模型连接。</small></>}
      {error&&<p className="view-dialog-error" role="alert">{error}</p>}<div className="modal-footer"><button className="secondary-button" type="button" onClick={()=>setDialog(null)}>取消</button><button className="gold-button" type="submit">{dialog==='remove'?'确认删除':dialog==='rename'?'保存名称':'保存视图'}</button></div>
    </form></div>,document.body)}
  </div>;
}
