import SettingRow from '../settings/SettingRow';
import {useState} from 'react';
import {FolderOpen} from 'lucide-react';
import {useFileWorkspace} from './WorkspaceContext';

export default function WorkspaceSettings({onSwitch}:{onSwitch:(root:string)=>Promise<void>}) {
  const space=useFileWorkspace(),[root,setRoot]=useState(space.info.root),[busy,setBusy]=useState(false),[error,setError]=useState('');
  return <section className="settings-card workspace-settings"><h2><FolderOpen size={18}/>当前写作空间</h2><p>直接读写这个文件夹里的 Markdown 文件，子文件夹也会同步显示。</p>
    <form onSubmit={async event=>{event.preventDefault();setError('');setBusy(true);try{await onSwitch(root.trim());}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}>
      <label>文件夹地址<input aria-label="写作空间文件夹地址" required value={root} disabled={busy} onChange={event=>setRoot(event.target.value)} placeholder="D:\\我的写作"/></label>
      <small>填写电脑上现有文件夹的完整路径。切换前会保存当前修改；原文件保留在原位置。切换后开启新的写作会话。</small>
      <button className="settings-primary" type="submit" disabled={busy||root.trim()===space.info.root}>{busy?'正在切换…':'使用这个文件夹'}</button>
    </form>
    <SettingRow title="自动保存正文修改" description="停止输入后自动保存。磁盘和本地同时修改时保留本地内容。"><input className="setting-switch" aria-label="自动保存正文修改" type="checkbox" checked={space.info.autoSave} disabled={busy} onChange={async event=>{setBusy(true);setError('');try{await space.update({autoSave:event.target.checked});}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}/></SettingRow>
    <p>文件列表和外部修改约每 2 秒同步。磁盘与本地同时修改时保留本地内容，核对后再处理。</p>
    {error&&<p role="alert" className="settings-feedback error">{error}</p>}
  </section>;
}
