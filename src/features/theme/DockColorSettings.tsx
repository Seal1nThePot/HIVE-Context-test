import type {WritingDockAppearance} from '../chat/writingDockAppearance';
import type {ThemePreferences} from './themePreferences';
import ThemeColorField from './ThemeColorField';

const groups=[
  {key:'frame',title:'底栏外框',fields:[['background','背景',true],['border','边框',false],['shadow','阴影',true]]},
  {key:'aiButton',title:'中心 AI 按钮',fields:[['icon','星形',false],['hoverIcon','悬停时星形',false],['border','细圆边',false]]},
  {key:'sideButtons',title:'左右图标按钮',fields:[['background','背景',true],['icon','图标',false],['border','边框',true],['activeIcon','开启时图标',false],['activeBackground','开启时背景',true],['activeBorder','开启时边框',true],['hoverIcon','悬停时图标',false],['hoverBackground','悬停时背景',true]]},
] as const;
export default function DockColorSettings({preferences,onChange}:{preferences:ThemePreferences;onChange:(next:(old:ThemePreferences)=>ThemePreferences)=>void}){
  function update(group:keyof WritingDockAppearance,key:string,value:string){onChange(old=>({...old,writingDock:{...old.writingDock,[group]:{...old.writingDock[group],[key]:value}}}));}
  const follow=preferences.writingDock.aiButton.background==='accent';
  return <section className="theme-detail-section"><h2>底部工具栏</h2><p>外框、中心按钮和左右图标在当前基础颜色下分别调整，随整套配色方案保存。带透明度的颜色可同时调整不透明度。</p>
    <div className="theme-dock-follow"><label><input type="checkbox" checked={follow} onChange={event=>update('aiButton','background',event.target.checked?'accent':preferences.colors.accent)}/>AI 按钮底色跟随强调色</label><ThemeColorField label="中心 AI 按钮底色" value={follow?preferences.colors.accent:preferences.writingDock.aiButton.background} onChange={value=>update('aiButton','background',value)}/></div>
    {groups.map(group=><section key={group.key}><h3>{group.title}</h3><div className="theme-detail-grid">{group.fields.map(([key,label,alpha])=><div key={key}><span>{label}</span><ThemeColorField label={`${group.title}${label}`} value={(preferences.writingDock[group.key] as unknown as Record<string,string>)[key]} alpha={alpha} onChange={value=>update(group.key,key,value)}/></div>)}</div></section>)}
  </section>;
}
