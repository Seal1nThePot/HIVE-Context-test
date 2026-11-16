import { defaultAppearance, useAppearance } from "./useAppearance";
import { useEffect, useState } from "react";
import SettingRow from './SettingRow';

type Props = ReturnType<typeof useAppearance>;
export default function AppearanceSettings({appearance,setAppearance,saveError}:Props) {
  const [draft,setDraft]=useState({uiScale:String(appearance.uiScale),textScale:String(appearance.textScale),editorSize:String(appearance.editorSize)});
  useEffect(()=>setDraft({uiScale:String(appearance.uiScale),textScale:String(appearance.textScale),editorSize:String(appearance.editorSize)}),[appearance]);
  const controls=[
    {key:'uiScale' as const,label:'UI 大小',min:80,max:150,unit:'%'},
    {key:'textScale' as const,label:'界面文字大小',min:80,max:160,unit:'%'},
    {key:'editorSize' as const,label:'正文与草稿字号',min:10,max:36,unit:'px'},
  ];
  return <><fieldset className="ribbon-display-settings">
    <legend>顶部编辑栏</legend>
    <SettingRow title="显示顶部编辑栏" description="显示「文件／开始／插入／审阅／视图」和下方工具区。面板入口在右上角，保存的布局在视图中。"><input className="setting-switch" aria-label="显示顶部编辑栏" type="checkbox" checked={appearance.ribbonVisible} onChange={event=>setAppearance(old=>({...old,ribbonVisible:event.target.checked}))}/></SettingRow>
    <SettingRow title="折叠工具区" description="仅保留选项卡，也可用编辑栏最右侧的三点菜单切换。"><input className="setting-switch" aria-label="折叠工具区，仅保留选项卡" type="checkbox" checked={appearance.ribbonCollapsed} disabled={!appearance.ribbonVisible} onChange={event=>setAppearance(old=>({...old,ribbonCollapsed:event.target.checked}))}/></SettingRow>
  </fieldset><fieldset className="appearance-settings">
    <legend>文字与界面</legend>
    <p>拖动滑块或输入数值，即时生效并在本机记住。</p>
    {controls.map(({key,label,min,max,unit})=><SettingRow key={key} title={<label htmlFor={`appearance-${key}`}>{label}</label>} description={`${min}–${max}${unit}`}>
      <input id={`appearance-${key}`} type="range" min={min} max={max} step={1} value={appearance[key]}
        onChange={event=>setAppearance(old=>({...old,[key]:Number(event.target.value)}))}/>
      <input type="number" aria-label={`${label}数值`} min={min} max={max} step={1} value={draft[key]}
        onChange={event=>{
          const text=event.target.value,value=Number(text);setDraft(old=>({...old,[key]:text}));
          if(text&&Number.isFinite(value)&&value>=min&&value<=max)setAppearance(old=>({...old,[key]:value}));
        }}
        onBlur={()=>{
          const parsed=Number(draft[key]),value=draft[key]&&Number.isFinite(parsed)?Math.max(min,Math.min(max,parsed)):appearance[key];
          setDraft(old=>({...old,[key]:String(value)}));setAppearance(old=>({...old,[key]:value}));
        }}
        onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}}}/>
      <span>{unit}</span>
    </SettingRow>)}
    <button type="button" className="text-button" onClick={()=>setAppearance(old=>({...old,uiScale:defaultAppearance.uiScale,textScale:defaultAppearance.textScale,editorSize:defaultAppearance.editorSize}))}>恢复默认大小</button>
    {saveError&&<p role="status">{saveError}</p>}
  </fieldset></>;
}
