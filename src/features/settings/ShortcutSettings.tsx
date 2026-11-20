import {useState} from 'react';
import {ChevronRight,Search} from "../../shared/icons";
import {useShortcutPreferences} from './ShortcutPreferences';
import type {MermaidZoomGesture} from './shortcutStorage';
import {shortcutGroups,shortcutChord,shortcutIssue,shortcutLabel,type ShortcutId} from './shortcuts';

export default function ShortcutSettings({longPress}:{longPress:boolean}){
  const {bindings,mermaidZoom,save}=useShortcutPreferences();
  const [zoomGesture,setZoomGesture]=useState(mermaidZoom);
  const [draft,setDraft]=useState(bindings),[search,setSearch]=useState(''),[folded,setFolded]=useState(new Set<string>());
  const [recording,setRecording]=useState<ShortcutId>(),[message,setMessage]=useState<{text:string;error?:boolean}>();
  const gestures=[['标注文字选区或面板','Ctrl + 单击'],['锁定 / 解锁面板位置',longPress?'长按标题栏 0.6 秒':'双击标题栏'],['取消拖动','Escape'],['拖动时保持浮动','Alt + 拖动'],['AI 消息换行','Shift + Enter']];
  const normalize=(value:string)=>value.toLowerCase().replace(/\s+/g,'');
  const query=normalize(search);
  const matches=(label:string,key:string,group:string)=>normalize(label+key+group).includes(query);
  const groups=shortcutGroups.map(({label,items})=>({label,items:items.filter(item=>matches(item.label,shortcutLabel(draft,item.id),label))})).filter(group=>group.items.length);
  const shownGestures=gestures.filter(([label,key])=>matches(label,key,'固定操作'));
  const showDiagram=matches('Mermaid 图表缩放','Ctrl + 滚轮 直接滚轮','图表手势');
  const dirty=zoomGesture!==mermaidZoom||shortcutGroups.some(group=>group.items.some(({id})=>bindings[id]!==draft[id]));
  function toggle(label:string){
    setFolded(old=>{const next=new Set(old);if(next.has(label))next.delete(label);else next.add(label);return next;});
  }
  return <section className="shortcut-settings">
    <div className="shortcut-settings-tools">
      <label className="settings-service-search"><Search size={15}/><input type="search" aria-label="搜索快捷键" placeholder="搜索操作或快捷键…" value={search} onChange={event=>setSearch(event.target.value)}/></label>
      <button type="button" className="settings-primary" disabled={!dirty||!!recording} onClick={()=>{
        try{save(draft,zoomGesture);setMessage({text:'快捷键已保存。'});}catch{setMessage({text:'无法保存快捷键，请重试。',error:true});}
      }}>保存快捷键</button>
      <button type="button" className="settings-secondary" disabled={!Object.keys(draft).length&&zoomGesture==='ctrl-wheel'} onClick={()=>{setDraft({});setZoomGesture('ctrl-wheel');setMessage(undefined);}}>恢复默认</button>
    </div>
    {message&&<p className={'settings-feedback'+(message.error?' error':'')} role={message.error?'alert':'status'}>{message.text}</p>}
    {groups.map(({label,items})=><section key={label} className="settings-card shortcut-group">
      <button type="button" className="shortcut-group-toggle" aria-expanded={!!query||!folded.has(label)} disabled={!!query} onClick={()=>toggle(label)}><ChevronRight size={16}/>{label}</button>
      {(query||!folded.has(label))&&items.map(item=><div className="shortcut-row" key={item.id}><span>{item.label}</span><button type="button" className="shortcut-key" aria-label={`修改${item.label}快捷键`} data-shortcut-recorder onBlur={()=>setRecording(current=>current===item.id?undefined:current)} onClick={()=>{setRecording(item.id);setMessage(undefined);}} onKeyDown={event=>{
        if(recording!==item.id)return;
        if(event.key==='Tab'){setRecording(undefined);return;}
        event.preventDefault();event.stopPropagation();
        if(event.repeat)return;
        const chord=shortcutChord(event.nativeEvent);
        if(!chord)return;
        const issue=shortcutIssue(draft,item.id,chord);
        if(chord==='Escape'&&item.id!=='stopGeneration'){setRecording(undefined);setMessage(undefined);return;}
        if(issue){setMessage({text:issue,error:true});return;}
        setDraft(old=>({...old,[item.id]:chord}));setRecording(undefined);setMessage(undefined);
      }}><kbd>{recording===item.id?'按下新的快捷键':shortcutLabel(draft,item.id)}</kbd></button></div>)}
    </section>)}
    {showDiagram&&<section className="settings-card shortcut-group">
      <button type="button" className="shortcut-group-toggle" aria-expanded={!!query||!folded.has('图表手势')} disabled={!!query} onClick={()=>toggle('图表手势')}><ChevronRight size={16}/>图表手势</button>
      {(query||!folded.has('图表手势'))&&<label className="shortcut-row"><span>Mermaid 图表缩放</span>
        <select value={zoomGesture} onChange={event=>{setZoomGesture(event.target.value as MermaidZoomGesture);setMessage(undefined);}}>
          <option value="ctrl-wheel">Ctrl + 滚轮</option><option value="wheel">直接滚轮</option>
        </select></label>}
    </section>}
    {!!shownGestures.length&&<section className="settings-card shortcut-group">
      <button type="button" className="shortcut-group-toggle" aria-expanded={!!query||!folded.has('固定操作')} disabled={!!query} onClick={()=>toggle('固定操作')}><ChevronRight size={16}/>固定操作</button>
      {(query||!folded.has('固定操作'))&&shownGestures.map(([label,key])=><div className="shortcut-row" key={label}><span>{label}</span><kbd>{key}</kbd></div>)}
    </section>}
    {!groups.length&&!shownGestures.length&&!showDiagram&&<p className="settings-empty">没有匹配的快捷键</p>}
  </section>;
}
