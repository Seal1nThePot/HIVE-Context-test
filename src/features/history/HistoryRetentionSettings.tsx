import {useEffect,useState} from 'react';
import type {HistoryLimits} from './historyTypes';

export default function HistoryRetentionSettings({limits,onSave}:{limits:HistoryLimits;onSave:(limits:HistoryLimits)=>Promise<void>}){
  const [human,setHuman]=useState(String(limits.human)),[ai,setAi]=useState(String(limits.ai));
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  useEffect(()=>{setHuman(String(limits.human));setAi(String(limits.ai));},[limits.human,limits.ai]);
  return <form className="settings-card feature-settings" onSubmit={async event=>{
    event.preventDefault();setSaving(true);setSaved(false);setError('');
    try{await onSave({human:Number(human),ai:Number(ai)});setSaved(true);}
    catch(reason){setError((reason as Error).message);}
    finally{setSaving(false);}
  }}>
    <h2>历史记录保留上限</h2>
    <label>人工操作保留条数 <input aria-label="人工操作保留条数" type="number" required min={0} max={1000} step={1} value={human} onChange={event=>{setHuman(event.target.value);setSaved(false);}}/></label>
    <label>AI 操作保留条数 <input aria-label="AI 操作保留条数" type="number" required min={0} max={1000} step={1} value={ai} onChange={event=>{setAi(event.target.value);setSaved(false);}}/></label>
    <p>按当前仓库保留最新记录。设为 0 可关闭该类记录，文件快照独立保存。</p>
    {error&&<p role="alert">{error}</p>}{saved&&<p role="status">历史记录设置已保存。</p>}
    <button type="submit" className="settings-primary" disabled={saving}>{saving?'保存中…':'保存历史记录设置'}</button>
  </form>;
}
