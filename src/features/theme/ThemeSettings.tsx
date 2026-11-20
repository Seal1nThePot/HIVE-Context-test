import {useState} from 'react';
import ChildWindow from '../workspace/ChildWindow';
import SettingRow from '../settings/SettingRow';
import {switchThemeBase,themeTokens,type BaseColor,type ThemePreferences} from './themePreferences';
import TemplateManagement from './TemplateManagement';
import CustomColorSettings from './CustomColorSettings';
import ThemeColorField from './ThemeColorField';
import {useTheme} from './themeStore';
import {useTemplateFiles} from './templateFiles';
import './theme.css';

const baseLabels={black:'黑色',white:'白色',gray:'浅灰',custom:'自定义'};

export default function ThemeSettings(){
  const {preferences,setTheme,saveDefaultTheme,restoreDefaultTheme,restoreTemplateBase,saveError,templateId,templateBinding}=useTheme(),
    [templates,setTemplates]=useState(false),[custom,setCustom]=useState(false),[notice,setNotice]=useState('');
  const files=useTemplateFiles(),templateName=templateBinding?.name||files.templates.find(item=>item.id===templateId)?.name||'正在读取模板';
  const bases=templateBinding?.bases||files.templates.find(item=>item.id===templateId)?.bases||[preferences.base];
  const baseLabel=baseLabels[preferences.base];
  const iconNotice=files.iconWarning&&<p role="status">{files.iconWarning}</p>;
  function updateTheme(next:(old:ThemePreferences)=>ThemePreferences){setNotice('');setTheme(next);}
  function saveScheme(){setTheme(old=>({...old,surfaceColors:{...old.surfaceColors,[old.base]:themeTokens(old).surfaces}}));setNotice(saveDefaultTheme()?`已保存${templateName} · ${baseLabel}方案，并设为默认方案。`:'');}
  if(templates)return <><TemplateManagement onBack={()=>setTemplates(false)}/>{iconNotice}</>;
  return <section className="settings-card theme-settings">
    <SettingRow title="模板管理" description={`当前模板：${templateName}。模板与配色按文件夹保存。`}><button type="button" className="settings-secondary" onClick={()=>setTemplates(true)}>管理</button></SettingRow>
    <SettingRow title={<label htmlFor="theme-base">基础颜色</label>} description={`${templateName} · ${baseLabel}方案；各区域颜色在「自定义配色」里逐项调整。`}><select id="theme-base" value={preferences.base} onChange={event=>updateTheme(old=>switchThemeBase(old,event.target.value as BaseColor))}>{bases.map(base=><option key={base} value={base}>{baseLabels[base]}</option>)}</select>{preferences.base==='custom'&&<ThemeColorField label="自定义基础" value={preferences.customBase} onChange={value=>updateTheme(old=>({...old,customBase:value}))}/>}</SettingRow>
    <SettingRow title="当前方案" description="个人调色保存到本机；恢复当前模板基准不会修改模板文件。"><span className="theme-current-scheme">{`${templateName} · ${baseLabel}`}</span><button type="button" className="settings-secondary" disabled={!templateBinding} onClick={()=>{try{restoreTemplateBase();setNotice(`已恢复${templateName}当前基础色，仅更新个人配色，模板文件未修改。`);}catch(error){setNotice((error as Error).message);}}}>恢复模板基准</button><button type="button" className="settings-primary" onClick={saveScheme}>保存方案</button></SettingRow>
    <SettingRow title="默认方案" description="整套配色可随时存为默认，之后一键恢复。"><button type="button" className="settings-secondary" onClick={()=>setNotice(saveDefaultTheme()?'当前整套配色已保存为默认方案。':'')}>设为默认</button><button type="button" className="settings-secondary" onClick={()=>{restoreDefaultTheme();setNotice('已恢复默认方案。');}}>恢复默认</button></SettingRow>
    <SettingRow title="自定义配色" description="功能色、面板、文字、编辑器与工具栏的颜色，按主版面分组，进去逐项调整。"><button type="button" className="settings-secondary" aria-haspopup="dialog" aria-expanded={custom} onClick={()=>setCustom(true)}>进入自定义配色 ›</button></SettingRow>
    {!saveError&&notice&&<p role="status">{notice}</p>}
    {saveError&&<p role="status">{saveError}</p>}
    {custom&&<ChildWindow id="custom-color-settings" title="自定义配色" onClose={()=>setCustom(false)}>
      <div className="settings-page theme-custom-scroll">
        <CustomColorSettings preferences={preferences} onChange={updateTheme} trackDefaults={templateBinding?.defaults.reasoningTrackProfiles?.[preferences.base]}/>
        {saveError&&<p role="alert" className="settings-feedback error">{saveError}</p>}
      </div>
    </ChildWindow>}
    {files.error&&<p role="status">模板文件：{files.error}</p>}
    {iconNotice}
  </section>;
}
