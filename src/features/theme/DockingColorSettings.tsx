import type {ThemePreferences} from './themePreferences';
import ThemeColorField from './ThemeColorField';
import {dockingColorFields,dockingColors,type DockingColorRole} from './dockingAppearance';

export default function DockingColorSettings({preferences,onChange}:{preferences:ThemePreferences;onChange:(next:(old:ThemePreferences)=>ThemePreferences)=>void}){
  const colors=dockingColors(preferences),groups=[...new Set(Object.values(dockingColorFields).map(field=>field.group))];
  return <section className="theme-detail-section"><h2>停靠引导与拖放</h2><p>调整拖动面板时的方向按钮、落位预览和侧栏拖放高亮。随当前模板与基础颜色保存；带透明度的颜色可调整不透明度。</p>
    {groups.map(group=><section key={group}><h3>{group}</h3><div className="theme-detail-grid">{(Object.keys(dockingColorFields) as DockingColorRole[]).filter(key=>dockingColorFields[key].group===group).map(key=>{
      const field=dockingColorFields[key];return <div key={key}><span>{field.label}</span><ThemeColorField label={`${group}${field.label}`} value={colors[key]} alpha={field.alpha} onChange={value=>onChange(old=>({...old,dockingProfiles:{...old.dockingProfiles,[old.base]:{...old.dockingProfiles[old.base],[key]:value}}}))}/></div>;
    })}</div></section>)}
  </section>;
}
