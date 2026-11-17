import {useState} from 'react';
import SettingRow from '../settings/SettingRow';
import {useTheme} from './themeStore';
import {initializeThemeFiles,loadTemplateFile,openCurrentTemplateFolder,refreshTemplateCatalog,saveCurrentTemplate,useTemplateFiles} from './templateFiles';
import './templateManagement.css';

export default function TemplateManagement({onBack}:{onBack:()=>void}){
  const {templateId,templateDirty}=useTheme(),files=useTemplateFiles();
  const [pending,setPending]=useState(false),[notice,setNotice]=useState('');
  const current=files.templates.find(item=>item.id===templateId);
  async function run(action:()=>Promise<unknown>,message:string){
    setPending(true);setNotice('');
    try{await action();setNotice(message);}catch(error){setNotice((error as Error).message);}finally{setPending(false);}
  }
  return <>
    <button type="button" className="theme-back" onClick={onBack}>← 返回外观</button>
    <section className="settings-card theme-template-management">
      <h2>模板管理</h2>
      <SettingRow title="当前模板" description={current?.description||'模板文件与配色文件保存在同一文件夹。'}><span>{current?.name||'青苔鎏金'}</span></SettingRow>
      <SettingRow title="当前模板文件夹" description={current?.directory||files.directory||'正在连接模板文件夹…'}>
        <button type="button" className="settings-secondary" disabled={pending} onClick={()=>void run(openCurrentTemplateFolder,'已打开当前模板文件夹。')}>打开当前模板文件夹</button>
      </SettingRow>
      {files.sourceDirectory&&<SettingRow title="模板源文件夹" description={files.sourceDirectory}><span>自动同步</span></SettingRow>}
      <SettingRow title="模板配色" description="个人调色自动保存在用户偏好中。只有“保存到模板”会修改模板文件，并保留上一份备份。">
        <button type="button" className="settings-secondary" disabled={pending} onClick={()=>void run(async()=>{if(!await saveCurrentTemplate())throw new Error('配色尚未写入模板文件，请查看保存提示。');},'当前配色已明确保存到模板，并保留之前的模板备份。')}>保存到模板</button>
        <button type="button" className="settings-secondary" disabled={pending} onClick={()=>void run(()=>loadTemplateFile(templateId),'已重新读取模板配色。')}>重新读取配色</button>
      </SettingRow>
      <p className="theme-template-status" role="status">{files.error||notice||(files.status==='saving'?'正在保存模板文件…':templateDirty?'个人配色正在保存…':files.status==='ready'?'模板已读取，个人调色独立保存。':'正在读取模板…')}</p>
      <div className="theme-template-heading"><h3>可用模板</h3><button type="button" className="settings-secondary" disabled={pending} onClick={()=>void run(async()=>{await refreshTemplateCatalog();if(files.status==='error')await initializeThemeFiles();},'模板列表已刷新。')}>刷新列表</button></div>
      {files.templates.map(template=><SettingRow key={template.id} title={template.name} description={template.description}>{template.id===templateId?<span>使用中</span>:<button type="button" className="settings-secondary" disabled={pending} onClick={()=>void run(()=>loadTemplateFile(template.id),`已切换到${template.name}。`)}>使用模板</button>}</SettingRow>)}
      {files.warnings.map(warning=><p key={warning} role="status">{warning}</p>)}
    </section>
  </>;
}
