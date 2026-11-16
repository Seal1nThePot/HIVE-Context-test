import {useEffect,useMemo,useRef,useState} from 'react';
import type {EditorView} from '@codemirror/view';
import {getSearchQuery,setSearchQuery,findNext,findPrevious,replaceNext,replaceAll} from '@codemirror/search';
import {ArrowDown,ArrowUp} from 'lucide-react';
import {emptyFind,makeSearchQuery,searchMatches,type FindFields} from './searchTools';
import './editor-tools.css';

export default function FindReplacePanel({editor,open,label,onClose}:{editor:EditorView|null;open:boolean;label:string;onClose:()=>void}){
  const [fields,setFields]=useState<FindFields>(emptyFind),[notice,setNotice]=useState('');const input=useRef<HTMLInputElement>(null);
  const query=useMemo(()=>makeSearchQuery(fields),[fields]),matches=useMemo(()=>editor&&open?searchMatches(editor.state,query):{count:0,more:false},[editor?.state.doc,query,open]);
  useEffect(()=>{if(!editor||!open)return;const existing=getSearchQuery(editor.state),range=editor.state.selection.main,selected=range.empty?'':editor.state.sliceDoc(range.from,range.to);
    setFields(old=>({...old,search:selected&&selected.length<=2000?selected:existing.search||old.search}));setNotice('');input.current?.focus();input.current?.select();
  },[editor,open]);
  useEffect(()=>{if(editor&&open&&!getSearchQuery(editor.state).eq(query))editor.dispatch({effects:setSearchQuery.of(query)});},[editor,open,query]);
  function run(command:typeof findNext){if(!editor||!query.valid)return;editor.dispatch({effects:setSearchQuery.of(query)});const done=command(editor);setNotice(done?'':matches.count?'请先定位一个匹配项':'没有匹配项');}
  const disabled=!editor||!query.valid;
  const result=notice||(fields.search&&!query.valid?'正则表达式无效':!fields.search?'输入要查找的文字':`${matches.count.toLocaleString()}${matches.more?'+':''} 处匹配`);
  return <div className="find-replace-content" onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();editor?.focus();}
    if(event.key==='F3'||(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='g'){event.preventDefault();event.stopPropagation();run(event.shiftKey?findPrevious:findNext);}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'){event.preventDefault();event.stopPropagation();input.current?.focus();input.current?.select();}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='h'){event.preventDefault();event.stopPropagation();event.currentTarget.querySelector<HTMLInputElement>('[aria-label="替换内容"]')?.focus();}
  }}>
    <small className="find-target" title={label}>{label||'请先打开文档'}</small>
    <div className="find-input-row"><input ref={input} data-find-input aria-label="查找内容" placeholder="查找…" value={fields.search} maxLength={2000} onChange={event=>{setFields({...fields,search:event.target.value});setNotice('');}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();run(event.shiftKey?findPrevious:findNext);}}}/><button type="button" aria-label="上一处匹配" title="上一处（Shift+Enter）" disabled={disabled} onClick={()=>run(findPrevious)}><ArrowUp size={15}/></button><button type="button" aria-label="下一处匹配" title="下一处（Enter）" disabled={disabled} onClick={()=>run(findNext)}><ArrowDown size={15}/></button></div>
    <div className="find-input-row"><input aria-label="替换内容" placeholder="替换为…" value={fields.replace} onChange={event=>setFields({...fields,replace:event.target.value})} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();run(replaceNext);}}}/><button type="button" disabled={disabled||editor?.state.readOnly} onClick={()=>run(replaceNext)}>替换</button><button type="button" aria-label="全部替换" title="全部替换" disabled={disabled||editor?.state.readOnly} onClick={()=>run(replaceAll)}>全部</button></div>
    <div className="find-options">{(['caseSensitive','wholeWord','regexp'] as const).map((key,index)=><label key={key}><input type="checkbox" checked={fields[key]} onChange={event=>setFields({...fields,[key]:event.target.checked})}/>{['区分大小写','全词','正则'][index]}</label>)}</div>
    <span className="find-result" role="status">{result}</span>
  </div>;
}
