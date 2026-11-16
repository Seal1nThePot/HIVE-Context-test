import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {AlignLeft,Calendar,Clock,ChevronDown,Code2,Hash,List,Plus,Tags,Trash2,X,CornerUpRight,CheckSquare} from 'lucide-react';
import type {InsertTarget} from './EditorInsertDialog';
import {notePropertiesTransaction,readNoteProperties,type NoteProperty,type PropertyType} from './noteProperties';
import './note-properties.css';

const propertyTypes:{id:PropertyType;label:string;Icon:typeof AlignLeft}[]=[{id:'text',label:'文本',Icon:AlignLeft},{id:'number',label:'数字',Icon:Hash},{id:'boolean',label:'复选框',Icon:CheckSquare},{id:'date',label:'日期',Icon:Calendar},{id:'datetime',label:'日期与时间',Icon:Clock},{id:'list',label:'列表',Icon:List},{id:'yaml',label:'YAML',Icon:Code2}];
const commonProperties=[{key:'aliases',Icon:CornerUpRight},{key:'cssclasses',Icon:List},{key:'tags',Icon:Tags}];

export default function NotePropertiesDialog({target,onClose,onApplied}:{target:InsertTarget;onClose:()=>void;onApplied:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),snapshot=useRef(target.editor.state.doc),counter=useRef(0);
  const [initial]=useState(()=>{try{return {rows:readNoteProperties(snapshot.current.toString()),error:''};}catch(error){return {rows:[],error:(error as Error).message};}});
  const [rows,setRows]=useState<NoteProperty[]>(()=>initial.rows.length?initial.rows:[{id:'new:initial',key:'',type:'text',value:''}]),[error,setError]=useState('');
  const [suggestion,setSuggestion]=useState<string|null>(null),[choice,setChoice]=useState(0),[typeMenu,setTypeMenu]=useState<string|null>(null);
  const [typePosition,setTypePosition]=useState({left:0,top:0}),typeMenuRef=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    if(!typeMenu)return;
    const button=dialog.current?.querySelector<HTMLButtonElement>('.property-type[aria-expanded=true]'),menu=typeMenuRef.current;
    if(!button||!menu)return;
    const rect=button.getBoundingClientRect(),height=menu.offsetHeight,width=menu.offsetWidth;
    setTypePosition({left:Math.max(8,Math.min(innerWidth-width-8,rect.left)),top:rect.bottom+height+5<=innerHeight-8?rect.bottom+5:Math.max(8,rect.top-height-5)});
    menu.querySelector<HTMLButtonElement>('[aria-checked=true]')?.focus();
  },[typeMenu]);
  useEffect(()=>{const close=()=>setTypeMenu(null);window.addEventListener('resize',close);return()=>window.removeEventListener('resize',close);},[]);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();dialog.current?.querySelector<HTMLInputElement>('[role="combobox"]')?.focus();return()=>{dialog.current?.close();if(previous?.isConnected)previous.focus({preventScroll:true});};},[]);
  function change(id:string,update:Partial<NoteProperty>){setRows(old=>old.map(row=>row.id===id?{...row,...update}:row));setError('');}
  function chooseName(row:NoteProperty,key:string,index:number){change(row.id,{key,...(!row.value&&row.type==='text'?{type:'list'}:{})});setSuggestion(null);requestAnimationFrame(()=>dialog.current?.querySelector<HTMLElement>(`[aria-label="属性值 ${index+1}"]`)?.focus());}
  function apply(){
    setError('');if(!target.valid()||target.editor.state.doc!==snapshot.current){setError('当前笔记或内容已变化，请关闭后重新打开笔记属性。');return;}
    try{const transaction=notePropertiesTransaction(target.editor.state,rows);if(transaction)target.editor.dispatch(transaction);onApplied();}catch(error){setError((error as Error).message);}
  }
  return createPortal(<dialog ref={dialog} className="note-properties-dialog" aria-label="笔记属性" onKeyDown={event=>{if(event.key==='Escape'&&typeMenu){event.preventDefault();event.stopPropagation();setTypeMenu(null);}}} onCancel={event=>{event.preventDefault();onClose();}}>
    <form onSubmit={event=>{event.preventDefault();apply();}} onPointerDown={event=>{if(!(event.target as Element).closest('.property-name')){setSuggestion(null);setTypeMenu(null);}}}><header><div><h2>笔记属性</h2><small>{target.file.split('/').at(-1)||'未命名稿'}</small></div><button type="button" className="icon-button" aria-label="关闭笔记属性" onClick={onClose}><X size={17}/></button></header>
      <p>属性保存在笔记顶部，按当前自动保存设置保存。</p>
      {initial.error?<p role="alert" className="properties-error">{initial.error}</p>:<>
      <div className="note-properties-rows">{rows.map((row,index)=>{const type=propertyTypes.find(item=>item.id===row.type)!,suggestions=commonProperties.filter(item=>item.key.includes(row.key.toLowerCase())&&!rows.some(other=>other.id!==row.id&&other.key.trim()===item.key));return <div className="note-property-row" key={row.id}>
        <div className="property-name" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null)){setSuggestion(null);setTypeMenu(null);}}}><button type="button" className="property-type" aria-label={`属性类型 ${index+1}：${type.label}`} title={`属性类型：${type.label} · 点击更改`} aria-haspopup="menu" aria-expanded={typeMenu===row.id} onClick={()=>{setSuggestion(null);setTypeMenu(old=>old===row.id?null:row.id);}}><type.Icon size={17}/><ChevronDown size={10}/></button>
        <input role="combobox" aria-label={`属性名 ${index+1}`} aria-autocomplete="list" aria-expanded={suggestion===row.id&&suggestions.length>0} aria-controls={`property-suggestions-${row.id}`} aria-activedescendant={suggestion===row.id&&choice>=0&&suggestions[choice]?`property-option-${row.id}-${choice}`:undefined} placeholder="属性名" maxLength={100} value={row.key} onFocus={()=>{setSuggestion(row.id);setChoice(0);setTypeMenu(null);}} onChange={event=>{change(row.id,{key:event.target.value});setSuggestion(row.id);setChoice(-1);}} onKeyDown={event=>{
          if(event.key==='Escape'&&suggestion===row.id){event.preventDefault();event.stopPropagation();setSuggestion(null);}
          if(['ArrowDown','ArrowUp'].includes(event.key)&&suggestions.length){event.preventDefault();setSuggestion(row.id);setChoice(old=>(old+(event.key==='ArrowDown'?1:suggestions.length-1)+suggestions.length)%suggestions.length);}
          if(event.key==='Enter'&&suggestion===row.id&&choice>=0&&suggestions[choice]){event.preventDefault();chooseName(row,suggestions[choice].key,index);}
        }}/>
        {suggestion===row.id&&suggestions.length>0&&<div className="property-suggestions" role="listbox" id={`property-suggestions-${row.id}`} aria-label="常用属性">{suggestions.map((item,option)=><button key={item.key} id={`property-option-${row.id}-${option}`} type="button" role="option" aria-selected={choice===option} onMouseDown={event=>event.preventDefault()} onClick={()=>chooseName(row,item.key,index)}><item.Icon size={16}/>{item.key}</button>)}</div>}
        {typeMenu===row.id&&<div ref={typeMenuRef} className="property-suggestions property-type-menu" style={typePosition} role="menu" aria-label="属性类型" onKeyDown={event=>{if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button')),index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();}}}>{propertyTypes.map(item=><button key={item.id} type="button" role="menuitemradio" aria-checked={item.id===row.type} onClick={()=>{change(row.id,{type:item.id,...(item.id==='boolean'?{value:row.value==='true'?'true':'false'}:{})});setTypeMenu(null);requestAnimationFrame(()=>dialog.current?.querySelector<HTMLElement>(`[aria-label="属性值 ${index+1}"]`)?.focus());}}><item.Icon size={16}/>{item.label}</button>)}</div>}
        </div>
        {row.type==='boolean'?<select aria-label={`属性值 ${index+1}`} value={row.value} onChange={event=>change(row.id,{value:event.target.value})}><option value="false">否</option><option value="true">是</option></select>:row.type==='date'?<input type="date" aria-label={`属性值 ${index+1}`} value={row.value} onChange={event=>change(row.id,{value:event.target.value})}/>:<textarea aria-label={`属性值 ${index+1}`} rows={row.type==='yaml'?3:1} placeholder={row.type==='list'?'没有值（每行一项）':row.type==='datetime'?'2026-11-16T15:30:00（可带时区）':'没有值'} value={row.value} onChange={event=>change(row.id,{value:event.target.value})}/>}
        <button type="button" className="property-remove" aria-label={`删除属性 ${index+1}`} title="删除属性" onClick={()=>setRows(old=>old.filter(item=>item.id!==row.id))}><Trash2 size={14}/></button>
      </div>;})}</div>
      <button type="button" className="property-add" disabled={rows.length>=64} onClick={()=>{setRows(old=>[...old,{id:'new:'+(++counter.current),key:'',type:'text',value:''}]);requestAnimationFrame(()=>dialog.current?.querySelector<HTMLInputElement>('.note-property-row:last-child input')?.focus());}}><Plus size={14}/>添加属性</button>
      </>}
      {error&&<p role="alert" className="properties-error">{error}</p>}
      <footer><button type="button" onClick={onClose}>取消</button><button type="submit" className="gold-button" disabled={!!initial.error}>应用到笔记</button></footer>
    </form>
  </dialog>,document.body);
}
