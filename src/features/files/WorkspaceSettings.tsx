import SettingRow from '../settings/SettingRow';
import {useState} from 'react';
import {useFileWorkspace} from './WorkspaceContext';

export default function WorkspaceSettings({onSwitch}:{onSwitch:(root:string)=>Promise<void>}) {
  const space=useFileWorkspace(),[root,setRoot]=useState(space.info.root),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const normalizedRoot=space.info.root.replace(/[\\/]+$/,'');
  const folderName=normalizedRoot.split(/[\\/]/).pop() || space.info.root;
  return <section className="settings-card workspace-settings">
    <SettingRow title="仓库文件夹名"><span className="workspace-folder-name">{folderName}</span></SettingRow>
    <SettingRow title={<label htmlFor="workspace-root">仓库目录位置</label>}>
      <form onSubmit={async event=>{event.preventDefault();setError('');setBusy(true);try{await onSwitch(root.trim());}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}>
        <input id="workspace-root" aria-label="仓库目录位置" required value={root} disabled={busy} onChange={event=>setRoot(event.target.value)} placeholder="D:\\我的写作"/>
        <button className="settings-primary" type="submit" disabled={busy||root.trim()===space.info.root}>{busy?'正在切换…':'使用此目录'}</button>
      </form>
    </SettingRow>
    <SettingRow title="是否自动保存"><input className="setting-switch" aria-label="是否自动保存" type="checkbox" checked={space.info.autoSave} disabled={busy} onChange={async event=>{setBusy(true);setError('');try{await space.update({autoSave:event.target.checked});}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}/></SettingRow>
    {error&&<p role="alert" className="settings-feedback error">{error}</p>}
  </section>;
}
