import {useState} from 'react';
import type {EditorState} from '@codemirror/state';
import {Settings2} from 'lucide-react';
import {countDescription,defaultStatus,documentStatistics,normalizeStatusOptions,paragraphDescription,readStatusOptions,statusLabel,textStatistics,type CountMode,type StatusKey,type StatusOptions} from './statusModel';
import './status-bar-settings.css';
export {defaultStatus,normalizeStatus,statusItems,type StatusKey} from './statusModel';
export {default as StatusBarSettings} from './StatusBarSettings';

export function useStatusPreferences(){
  const [items,setItems]=useState<StatusOptions>(()=>{try{return readStatusOptions(localStorage);}catch{return normalizeStatusOptions(null);}}),[error,setError]=useState('');
  // Accept the earlier array-shaped state retained by React's live update.
  const options=normalizeStatusOptions(items);
  function setOptions(next:StatusOptions){const normalized=normalizeStatusOptions(next);setItems(normalized);try{localStorage.setItem('hive.editor-status.v3',JSON.stringify({version:3,...normalized}));setError('');}catch{setError('底部栏设置暂时无法保存，当前调整仍生效。');}}
  return {...options,error,setOptions,setItems:(items:StatusKey[])=>setOptions({...options,items}),setCountMode:(countMode:CountMode)=>setOptions({...options,countMode}),reset:()=>setOptions({items:[...defaultStatus],countMode:'characters'})};
}
export type StatusPreferences=ReturnType<typeof useStatusPreferences>;
export default function EditorStatusBar({state,eol,bom,status,aiStatus,preferences,onSettings}:{status:string;aiStatus?:string;state:EditorState|null;eol?:string;bom?:boolean;preferences:StatusPreferences;onSettings:()=>void}){
  const statistics=state?documentStatistics(state.doc):{characters:0,pureCount:0,paragraphs:0},mode=preferences.countMode;
  const selected=preferences.items.includes('selection')?(state?.selection.ranges||[]).filter(range=>!range.empty).reduce((sum,range)=>{const counts=textStatistics(state!.sliceDoc(range.from,range.to));return sum+(mode==='text'?counts.pureCount:counts.characters);},0):0;
  const pos=state?.selection.main.head||0,line=state?.doc.lineAt(pos);
  const values:Record<StatusKey,string>={save:status,count:'',selection:`已选 ${selected} ${mode==='text'?'字':'字符'}`,position:`行 ${line?.number||1}，列 ${pos-(line?.from||0)+1}`,lines:`${state?.doc.lines||1} 行`,paragraphs:`${statistics.paragraphs.toLocaleString()} 段`,eol:eol||'LF',encoding:bom?'UTF-8 BOM':'UTF-8',format:'Markdown'};
  return <div className="editor-status-bar panel-status-footer" aria-label="写作区底部栏" onContextMenu={event=>{event.preventDefault();onSettings();}}><div className="editor-status-items">{preferences.items.map(key=>key==='save'?<span key={key} className="editor-save-status" role="status" aria-label="写作与保存状态"><i className="status-dot"/>{status}{aiStatus&&<span> · {aiStatus}</span>}</span>:key==='count'?<select key={key} className="editor-count-mode" aria-label="字数统计方式" title={countDescription} value={mode} onChange={event=>preferences.setCountMode(event.target.value==='text'?'text':'characters')}><option value="characters">{statistics.characters.toLocaleString()} 字符</option><option value="text">{statistics.pureCount.toLocaleString()} 字</option></select>:<span key={key} title={key==='paragraphs'?paragraphDescription:statusLabel(key)}>{values[key]}</span>)}</div><button type="button" aria-label="自定义写作区底部栏" title="自定义底部栏" onClick={onSettings}><Settings2 size={12}/></button></div>;
}
