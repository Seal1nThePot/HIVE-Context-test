import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {Text} from '@codemirror/state';
import {Plus,Trash2} from 'lucide-react';
import type {InsertTarget} from './EditorInsertDialog';
import {notePropertiesTransaction,readNoteProperties,type NoteProperty,type PropertyType} from './noteProperties';
import {useFrontmatterVisibility} from './frontmatterVisibility';
import './note-properties.css';

type Draft={snapshot:Text;rows:NoteProperty[];error:string;dirty:boolean;label:string};
const types:{id:PropertyType;label:string}[]=[{id:'text',label:'文本'},{id:'number',label:'数字'},{id:'boolean',label:'复选框'},{id:'date',label:'日期'},{id:'datetime',label:'日期与时间'},{id:'list',label:'列表'},{id:'yaml',label:'YAML'}];
function makeDraft(target:InsertTarget):Draft{
  const snapshot=target.editor.state.doc,label=target.file.split('/').at(-1)||'未命名稿';
  try{return {snapshot,rows:readNoteProperties(snapshot.toString()),error:'',dirty:false,label};}
  catch(error){return {snapshot,rows:[],error:(error as Error).message,dirty:false,label};}
}
function ValueArea({value,onChange,label,placeholder}:{value:string;onChange:(value:string)=>void;label:string;placeholder:string}){
  const ref=useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(()=>{const node=ref.current;if(!node)return;const resize=()=>{node.style.height='auto';node.style.height=node.scrollHeight+'px';};resize();let width=node.clientWidth;const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>{if(node.clientWidth!==width){width=node.clientWidth;resize();}});observer?.observe(node);return()=>observer?.disconnect();},[value]);
  return <textarea ref={ref} aria-label={label} rows={1} placeholder={placeholder} value={value} onChange={event=>onChange(event.target.value)}/>;
}
export default function NotePropertiesPanel({target,targetKey,onApplied}:{target:InsertTarget|null;targetKey:string;onApplied:()=>void}){
  const {visible,setVisible,error:visibilityError}=useFrontmatterVisibility();
  const [drafts,setDrafts]=useState<Record<string,Draft>>({}),[selected,setSelected]=useState(''),[error,setError]=useState('');
  const counter=useRef(0),currentKey=target?targetKey:'';
  useEffect(()=>{if(!target||!targetKey){setSelected('');return;}setDrafts(old=>old[targetKey]?old:{...old,[targetKey]:makeDraft(target)});setSelected(targetKey);setError('');},[targetKey,!!target]);
  useEffect(()=>{if(!target||!targetKey)return;setDrafts(old=>{const item=old[targetKey];return item&&!item.dirty&&item.snapshot!==target.editor.state.doc?{...old,[targetKey]:makeDraft(target)}:old;});},[targetKey,target?.editor.state.doc]);
  const key=selected||currentKey,draft=drafts[key],current=!!target&&key===currentKey;
  function update(fn:(draft:Draft)=>Draft){setDrafts(old=>old[key]?{...old,[key]:{...fn(old[key]),dirty:true}}:old);setError('');}
  function change(id:string,part:Partial<NoteProperty>){update(item=>({...item,rows:item.rows.map(row=>row.id===id?{...row,...part}:row)}));}
  function apply(){
    if(!target||!current||!draft||!target.valid()||target.editor.state.doc!==draft.snapshot){setError('笔记或内容已变化。草稿仍保留；请返回对应笔记核对，或复制后重新载入。');return;}
    try{const transaction=notePropertiesTransaction(target.editor.state,draft.rows);if(transaction)target.editor.dispatch(transaction);setDrafts(old=>({...old,[key]:makeDraft(target)}));setError('');onApplied();}catch(reason){setError((reason as Error).message);}
  }
  function reset(){if(!target||!current)return;setDrafts(old=>({...old,[key]:makeDraft(target)}));setError('');}
  const choices=Object.entries(drafts).filter(([id,item])=>id===currentKey||item.dirty);
  return <div className="note-properties-panel">
    <label className="properties-visibility">在正文开头显示属性 <input type="checkbox" role="switch" checked={visible} onChange={event=>setVisible(event.target.checked)}/></label>
    {visibilityError&&<p role="status">{visibilityError}</p>}
    {(choices.length>1||!currentKey&&choices.length>0)&&<label className="properties-drafts">属性草稿 <select value={key} onChange={event=>{setSelected(event.target.value);setError('');}}>{!key&&<option value="">选择未应用的草稿</option>}{choices.map(([id,item])=><option key={id} value={id}>{item.label}{item.dirty?' · 未应用':''}{id===currentKey?' · 当前笔记':''}</option>)}</select></label>}
    {!draft?<p className="properties-empty">打开笔记后可查看和编辑属性。</p>:<>
    {!current&&<p className="properties-warning">此草稿属于其他笔记，返回该笔记后可尝试应用；内容仍可复制。</p>}
    <div className="properties-scroll"><form id="note-properties-form" onSubmit={event=>{event.preventDefault();apply();}}>
      {draft.error?<p role="alert" className="properties-error">{draft.error}</p>:<>
      <div className="note-properties-rows">{draft.rows.map((row,index)=><div className="note-property-row" key={row.id}>
        <div className="property-name"><select aria-label={`属性类型 ${index+1}`} value={row.type} onChange={event=>change(row.id,{type:event.target.value as PropertyType})}>{types.map(type=><option key={type.id} value={type.id}>{type.label}</option>)}</select><input aria-label={`属性名 ${index+1}`} placeholder="属性名" maxLength={100} value={row.key} onChange={event=>change(row.id,{key:event.target.value})}/></div>
        {row.type==='boolean'?<select aria-label={`属性值 ${index+1}`} value={row.value} onChange={event=>change(row.id,{value:event.target.value})}><option value="false">否</option><option value="true">是</option></select>:row.type==='date'?<input type="date" aria-label={`属性值 ${index+1}`} value={row.value} onChange={event=>change(row.id,{value:event.target.value})}/>:<ValueArea label={`属性值 ${index+1}`} placeholder={row.type==='list'?'每行一项':'属性值'} value={row.value} onChange={value=>change(row.id,{value})}/>}
        <button type="button" className="property-remove" aria-label={`删除属性 ${index+1}`} onClick={()=>update(item=>({...item,rows:item.rows.filter(value=>value.id!==row.id)}))}><Trash2 size={14}/></button>
      </div>)}</div>
      <button type="button" className="property-add" disabled={draft.rows.length>=64} onClick={()=>update(item=>({...item,rows:[...item.rows,{id:'new:'+(++counter.current),key:'',type:'text',value:''}]}))}><Plus size={14}/>添加属性</button>
      </>}
      {error&&<p role="alert" className="properties-error">{error}</p>}
    </form></div>
    <footer><span>{draft.dirty?'有未应用的属性修改':''}</span><button type="button" disabled={!current||!draft.dirty} onClick={reset}>重新载入</button><button type="submit" form="note-properties-form" className="gold-button" disabled={!current||!!draft.error||!draft.dirty}>应用到笔记</button></footer>
    </>}
  </div>;
}
