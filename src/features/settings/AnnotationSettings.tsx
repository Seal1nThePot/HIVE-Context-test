import SettingRow from './SettingRow';
import type {AnnotationBubblePlacement} from './useAnnotationPreferences';
import {useAnnotationPreferences} from './useAnnotationPreferences';

export default function AnnotationSettings({preferences,setPreferences,saveError}:ReturnType<typeof useAnnotationPreferences>){
  return <section className="settings-card feature-settings"><h2>文本标注</h2>
    <SettingRow title="标注气泡位置" description="鼠标经过标注片段时显示气泡。点击气泡打开要求框，再点一次收起。">
      <select aria-label="标注气泡位置" value={preferences.bubblePlacement} onChange={event=>setPreferences(old=>({...old,bubblePlacement:event.target.value as AnnotationBubblePlacement}))}>
        <option value="left">段落左侧</option><option value="right">段落右侧</option><option value="above">段落上方</option><option value="below">段落下方</option>
      </select>
    </SettingRow>
    <p>选中已标注的文字后，可通过右键菜单取消标记，正文与剩余标注保留。</p>
    {saveError&&<p role="status">{saveError}</p>}
  </section>;
}
