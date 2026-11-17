import DockingColorSettings from './DockingColorSettings';
import EditorColorSettings from './EditorColorSettings';
import {useState} from 'react';
import SettingRow from '../settings/SettingRow';
import {colorRoles,switchThemeBase,themeTokens,updateThemeColors,type BaseColor,type ThemePreferences} from './themePreferences';
import {surfaceColorGroups} from './surfaceAppearance';
import ThemeColorField from './ThemeColorField';
import DockColorSettings from './DockColorSettings';
import {useTheme} from './themeStore';
import {rangeProgressStyle} from '../settings/rangeProgress';
import TemplateManagement from './TemplateManagement';
import {useTemplateFiles} from './templateFiles';
import './theme.css';
const roles={accent:'强调',secondary:'辅助',link:'链接',success:'成功',warning:'提示',danger:'错误'};
export default function ThemeSettings(){
  const {preferences,setTheme,saveDefaultTheme,restoreDefaultTheme,restoreTemplateBase,saveError,templateId,templateBinding}=useTheme(),[templates,setTemplates]=useState(false),[notice,setNotice]=useState('');
  const files=useTemplateFiles(),templateName=templateBinding?.name||files.templates.find(item=>item.id===templateId)?.name||'正在读取模板';
  const bases=templateBinding?.bases||files.templates.find(item=>item.id===templateId)?.bases||[preferences.base];
  const surfaces=themeTokens(preferences).surfaces,baseLabels={black:'黑色',white:'白色',gray:'浅灰',custom:'自定义'};
  function updateTheme(next:(old:ThemePreferences)=>ThemePreferences){setNotice('');setTheme(next);}
  function saveScheme(){setTheme(old=>({...old,surfaceColors:{...old.surfaceColors,[old.base]:themeTokens(old).surfaces}}));setNotice(saveDefaultTheme()?`已保存${templateName} · ${baseLabels[preferences.base]}方案，并设为默认方案。`:'');}
  if(templates)return <TemplateManagement onBack={()=>setTemplates(false)}/>;
  return <section className="settings-card theme-settings">
    <SettingRow title="模板管理" description={`当前模板：${templateName}。模板与配色按文件夹保存。`}><button type="button" className="settings-secondary" onClick={()=>setTemplates(true)}>管理</button></SettingRow>
    <SettingRow title={<label htmlFor="theme-base">基础颜色</label>} description={`${templateName} · ${baseLabels[preferences.base]}方案；各区域颜色可在下方分别调整。`}><select id="theme-base" value={preferences.base} onChange={event=>updateTheme(old=>switchThemeBase(old,event.target.value as BaseColor))}>{bases.map(base=><option key={base} value={base}>{baseLabels[base]}</option>)}</select>{preferences.base==='custom'&&<ThemeColorField label="自定义基础" value={preferences.customBase} onChange={value=>updateTheme(old=>({...old,customBase:value}))}/>}</SettingRow>
    <SettingRow title="栏面对比度" description="调整自动配色的层级；下方单独指定的颜色保持不变。"><label className="theme-auto-contrast"><input type="checkbox" checked={preferences.surfaceContrastMode==='auto'} onChange={event=>updateTheme(old=>({...old,surfaceContrastMode:event.target.checked?'auto':'manual'}))}/>自动</label>{preferences.surfaceContrastMode==='manual'&&<><input aria-label="栏面对比度" type="range" style={rangeProgressStyle(preferences.surfaceContrast,50,150)} min={50} max={150} step={5} value={preferences.surfaceContrast} onChange={event=>updateTheme(old=>({...old,surfaceContrast:Number(event.target.value)}))}/><output>{preferences.surfaceContrast}%</output></>}</SettingRow>
    <SettingRow title="配色方案" description="颜色由当前模板提供，个人调色单独保存。"><span id="theme-palette">{templateName}</span></SettingRow>
    <SettingRow title="文字颜色" description="正文、界面、辅助文字及编辑栏文字可在下方分别调色，随当前模板与基础颜色保存。"><span>自定义配色</span></SettingRow>
    <div className="theme-role-grid">{colorRoles.map(role=><div key={role}><span>{roles[role]}</span><ThemeColorField label={roles[role]} value={preferences.colors[role]} onChange={value=>updateTheme(old=>updateThemeColors(old,{[role]:value}))}/></div>)}</div>
    <SettingRow title={`${templateName} · ${baseLabels[preferences.base]}方案`} description="个人调色保存到本机；恢复当前模板基准不会修改模板文件。"><button type="button" className="settings-secondary" disabled={!templateBinding} onClick={()=>{try{restoreTemplateBase();setNotice(`已恢复${templateName}当前基础色，仅更新个人配色，模板文件未修改。`);}catch(error){setNotice((error as Error).message);}}}>恢复模板基准</button><button type="button" className="settings-primary" onClick={saveScheme}>保存个人{baseLabels[preferences.base]}方案</button></SettingRow>
    <SettingRow title="默认方案" description="保存当前整套配色，之后可随时恢复。"><button type="button" className="settings-secondary" onClick={()=>{restoreDefaultTheme();setNotice('已恢复默认方案。');}}>恢复默认方案</button><button type="button" className="settings-secondary" onClick={()=>setNotice(saveDefaultTheme()?'当前整套配色已保存为默认方案。':'')}>保存为默认方案</button></SettingRow>
    {!saveError&&notice&&<p role="status">{notice}</p>}
    {saveError&&<p role="status">{saveError}</p>}
    {files.error&&<p role="status">模板文件：{files.error}</p>}
    <EditorColorSettings preferences={preferences} onChange={updateTheme}/>
    {surfaceColorGroups.map(group=><section className="theme-detail-section" key={group.title}><h2>{group.title}</h2><div className="theme-detail-grid">{group.fields.filter(([key])=>key!=='document'&&key!=='documentText').map(([key,label])=><div key={key}><span>{label}</span><ThemeColorField label={label} value={surfaces[key]} onChange={value=>updateTheme(old=>({...old,surfaceColors:{...old.surfaceColors,[old.base]:{...old.surfaceColors[old.base],[key]:value}}}))}/></div>)}</div></section>)}
    <DockingColorSettings preferences={preferences} onChange={updateTheme}/>
    <DockColorSettings preferences={preferences} onChange={updateTheme}/>
  </section>;
}
