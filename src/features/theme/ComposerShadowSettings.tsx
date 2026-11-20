import {rangeProgressStyle} from '../settings/rangeProgress';
import ThemeColorField from './ThemeColorField';
import {defaultComposerShadow,type ComposerShadow,type ThemePreferences} from './themePreferences';

export default function ComposerShadowSettings({preferences,onChange}:{preferences:ThemePreferences;onChange:(next:(old:ThemePreferences)=>ThemePreferences)=>void}){
  const value=preferences.composerShadow??defaultComposerShadow;
  const update=(patch:Partial<ComposerShadow>)=>onChange(old=>({...old,composerShadow:{...(old.composerShadow??defaultComposerShadow),...patch}}));
  return <div className="theme-color-body composer-shadow-settings">
    <p className="theme-color-note">只作用于 AI 栏输入框的投影；面板、弹层与主聊天页的阴影不受影响。</p>
    <div className="theme-detail-grid">
      <div><span>阴影颜色</span><ThemeColorField label="输入框阴影" alpha value={value.color} onChange={color=>update({color})}/></div>
      <div><span>模糊半径</span><input aria-label="阴影模糊半径" type="range" min={0} max={40} step={1} value={value.blur} style={rangeProgressStyle(value.blur,0,40)} onChange={event=>update({blur:Number(event.target.value)})}/><output>{value.blur}px</output></div>
      <div><span>垂直偏移</span><input aria-label="阴影垂直偏移" type="range" min={-24} max={24} step={1} value={value.offsetY} style={rangeProgressStyle(value.offsetY,-24,24)} onChange={event=>update({offsetY:Number(event.target.value)})}/><output>{value.offsetY}px</output></div>
      <div><span>预览与重置</span><span className="composer-shadow-preview" aria-hidden="true" style={{boxShadow:`0 ${value.offsetY}px ${value.blur}px ${value.color}`}}/><button type="button" className="settings-secondary" onClick={()=>onChange(old=>({...old,composerShadow:{...defaultComposerShadow}}))}>恢复默认</button></div>
    </div>
  </div>;
}
