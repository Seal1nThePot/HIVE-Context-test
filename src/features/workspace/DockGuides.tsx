import {ArrowDown,ArrowLeft,ArrowRight,ArrowUp,Layers} from 'lucide-react';
import type {DockFeedback} from './dockInteraction';
import './dock-guides.css';
export default function DockGuides({feedback,free,label,draggedLabel,tabs,locked}:{feedback:DockFeedback|null;free:boolean;label:string;draggedLabel:string;tabs:string[];locked:boolean}){
  const ready=feedback?.ready;
  const icons={left:ArrowLeft,right:ArrowRight,top:ArrowUp,bottom:ArrowDown,center:Layers};
  return <div className="dock-guides-overlay" aria-label="面板布局引导">
    {feedback?.visible&&<>
      {feedback.target&&<div className="dock-guide-region" style={{left:feedback.target.rect.x,top:feedback.target.rect.y,width:feedback.target.rect.width,height:feedback.target.rect.height}}/>}
      {feedback.guides.map(guide=>{const Icon=icons[guide.edge];
        return <div key={guide.key} className={`dock-guide ${guide.scope==='workspace'?'outer-guide':'inner-guide'} ${guide.edge==='center'?'stack-guide':''} ${ready?.key===guide.key?'ready':''}`}
          data-dock-scope={guide.scope} data-dock-edge={guide.edge} data-dock-target={guide.target} role="img" aria-label={guide.label}
          style={{left:guide.button.x,top:guide.button.y,width:guide.button.width,height:guide.button.height}}>
          <Icon size={guide.edge==='center'?16:19}/><small>{guide.scope==='workspace'?'新栏':guide.edge==='center'?'标签':'分栏'}</small>
        </div>;
      })}
    </>}
    {ready&&<div className={`dock-placement-preview intentional-dock-preview ${ready.edge==='center'?'stack-dock-preview':''}`} aria-label="面板落位预览" style={{left:ready.preview.x,top:ready.preview.y,width:ready.preview.width,height:ready.preview.height}}>
      {ready.edge==='center'&&<div className="dock-preview-tabs" aria-label="合并后的标签预览">{tabs.map((tab,index)=><span key={index}>{tab}</span>)}<span className="incoming-tab">{draggedLabel}</span></div>}
      <span>松手后{ready.label}{ready.scope==='panel'?` · ${label}`:''}</span>
    </div>}
    <div className="dock-drag-hint" role="status">{free?'自由移动':ready?`松手后${ready.label}`:locked?'自由移动 · 工作区位置已锁定':'拖到箭头分栏或标签图标堆叠，松手即可完成 · Alt 仅移动'}</div>
  </div>;
}
