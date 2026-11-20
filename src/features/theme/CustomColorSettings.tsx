import SettingRow from '../settings/SettingRow';
import ThemeColorField from './ThemeColorField';
import EditorColorSettings from './EditorColorSettings';
import DockColorSettings from './DockColorSettings';
import DockingColorSettings from './DockingColorSettings';
import ComposerShadowSettings from './ComposerShadowSettings';
import {colorRoles,mix,themeTokens,updateThemeColors,type ReasoningTrackColors,type ThemePreferences} from './themePreferences';
import {surfaceColorGroups,type SurfaceColorRole} from './surfaceAppearance';
import {rangeProgressStyle} from '../settings/rangeProgress';

const roleLabels={accent:'强调',secondary:'辅助',link:'链接',success:'成功',warning:'提示',danger:'错误'};
const trackParts=['left','middle','right'] as const;
const workspaceInners=['titleBar','ribbonTitleBackground','ribbonTitleText','ribbon','ribbonContentText','ribbonBorder','leftRailBackground','leftRailIcon','rightRailBackground','rightRailIcon','workspace','panel','panelHeader','panelBorder','panelInnerBorder','selectedTab'];

type Field=readonly [SurfaceColorRole,string];

export default function CustomColorSettings({preferences,onChange,trackDefaults}:{
  preferences:ThemePreferences;
  onChange:(next:(old:ThemePreferences)=>ThemePreferences)=>void;
  trackDefaults?:ReasoningTrackColors;
}){
  const tokens=themeTokens(preferences),surfaces=tokens.surfaces;
  const track=preferences.reasoningTrackProfiles?.[preferences.base]??trackDefaults;
  const trackColors=track??{left:tokens.accent,middle:mix(tokens.accent,tokens.rawAccent,.5),right:tokens.rawAccent};
  const setSurface=(key:SurfaceColorRole,value:string)=>onChange(old=>({...old,surfaceColors:{...old.surfaceColors,[old.base]:{...old.surfaceColors[old.base],[key]:value}}}));
  const field=([key,label]:Field)=>key==='document'||key==='documentText'?null:<div key={key}><span>{label}</span><ThemeColorField label={label} value={surfaces[key]} onChange={value=>setSurface(key,value)}/></div>;
  const group=(title:string):readonly Field[]=>surfaceColorGroups.find(item=>item.title===title)!.fields;
  const workspace=group('工作区与面板').filter(([key])=>workspaceInners.includes(key));
  const pick=(keys:string[])=>(workspace as readonly Field[]).filter(([key])=>keys.includes(key));
  const updateTrack=(part:typeof trackParts[number],color:string)=>onChange(old=>{
    const reference=old.reasoningTrackProfiles?.[old.base]??trackDefaults??{left:themeTokens(old).accent,middle:mix(themeTokens(old).accent,themeTokens(old).rawAccent,.5),right:themeTokens(old).rawAccent};
    return {...old,reasoningTrackProfiles:{...old.reasoningTrackProfiles,[old.base]:{...reference,[part]:color}}};
  });
  const resetTrack=()=>onChange(old=>{
    const profiles={...old.reasoningTrackProfiles};
    if(trackDefaults)profiles[old.base]=trackDefaults;else delete profiles[old.base];
    return {...old,reasoningTrackProfiles:profiles};
  });
  return <section className="settings-card theme-settings theme-custom-colors">
      <p className="theme-custom-intro">颜色随当前模板与基础色保存；带透明度的颜色可同时调整不透明度。未自定义的区域沿用主题自动配色。</p>
      <SettingRow title="栏面对比度" description="调整自动配色的层级；下方单独指定的颜色保持不变。">
        <label className="theme-auto-contrast"><input type="checkbox" checked={preferences.surfaceContrastMode==='auto'} onChange={event=>onChange(old=>({...old,surfaceContrastMode:event.target.checked?'auto':'manual'}))}/>自动</label>
        {preferences.surfaceContrastMode==='manual'&&<><input aria-label="栏面对比度" type="range" style={rangeProgressStyle(preferences.surfaceContrast,50,150)} min={50} max={150} step={5} value={preferences.surfaceContrast} onChange={event=>onChange(old=>({...old,surfaceContrast:Number(event.target.value)}))}/><output>{preferences.surfaceContrast}%</output></>}
      </SettingRow>
      <details className="theme-color-group" open>
        <summary>全局与文字</summary>
        <div className="theme-color-body">
          <h3>功能色</h3>
          <div className="theme-role-grid">{colorRoles.map(role=><div key={role}><span>{roleLabels[role]}</span><ThemeColorField label={roleLabels[role]} value={preferences.colors[role]} onChange={value=>onChange(old=>updateThemeColors(old,{[role]:value}))}/></div>)}</div>
          <h3>界面文字与选中状态</h3>
          <div className="theme-detail-grid">{group('界面文字与选中状态').map(field)}</div>
        </div>
      </details>
      <details className="theme-color-group">
        <summary>工作区与面板</summary>
        <div className="theme-color-body">
          <h3>标题栏与编辑栏</h3>
          <div className="theme-detail-grid">{pick(['titleBar','ribbonTitleBackground','ribbonTitleText','ribbon','ribbonContentText','ribbonBorder']).map(field)}</div>
          <h3>左右收纳栏</h3>
          <div className="theme-detail-grid">{pick(['leftRailBackground','leftRailIcon','rightRailBackground','rightRailIcon']).map(field)}</div>
          <h3>面板与工作区</h3>
          <div className="theme-detail-grid">{pick(['workspace','panel','panelHeader','panelBorder','panelInnerBorder','selectedTab']).map(field)}</div>
          <h3>AI 版面</h3>
          <p className="theme-color-note">推理强度滑条的轨道渐变；为当前模板和基础颜色分别设置，未自定义时沿用主题。</p>
          <div className="reasoning-track-color-fields">{trackParts.map((part,index)=><div key={part}><span>{['左','中','右'][index]}</span><ThemeColorField label={`推理轨道${['左','中','右'][index]}`} value={trackColors[part]} onChange={color=>updateTrack(part,color)}/></div>)}<button type="button" className="settings-secondary" onClick={resetTrack}>恢复轨道颜色</button></div>
        </div>
      </details>
      <details className="theme-color-group">
        <summary>输入框阴影</summary>
        <ComposerShadowSettings preferences={preferences} onChange={onChange}/>
      </details>
      <details className="theme-color-group">
        <summary>文本编辑页面</summary>
        <div className="theme-color-body"><EditorColorSettings preferences={preferences} onChange={onChange}/></div>
      </details>
      <details className="theme-color-group">
        <summary>顶栏与底部工具栏</summary>
        <div className="theme-color-body"><DockColorSettings preferences={preferences} onChange={onChange}/></div>
      </details>
      <details className="theme-color-group">
        <summary>设置与弹出框</summary>
        <div className="theme-color-body"><div className="theme-detail-grid">{group('设置与弹出框').map(field)}</div></div>
      </details>
      <details className="theme-color-group">
        <summary>停靠引导与拖放</summary>
        <div className="theme-color-body"><DockingColorSettings preferences={preferences} onChange={onChange}/></div>
      </details>
  </section>;
}
