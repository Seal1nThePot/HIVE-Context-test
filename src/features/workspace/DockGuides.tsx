import {Icon} from '../../shared/icons';
import {dockIconNames} from '../../../shared/iconPack.mjs';
import type {DockFeedback} from './dockInteraction';
import './dock-guides.css';
export default function DockGuides({feedback}:{feedback:DockFeedback|null;free:boolean;label:string;draggedLabel:string;tabs:string[];locked:boolean}){
  const ready=feedback?.ready;
  return <div className="dock-guides-overlay" aria-label="面板布局引导">
    {feedback?.visible&&<>
      {feedback.target&&<div className="dock-guide-region" style={{left:feedback.target.rect.x,top:feedback.target.rect.y,width:feedback.target.rect.width,height:feedback.target.rect.height}}/>}
      {feedback.guides.map(guide=><div key={guide.key} className={`dock-guide ${guide.scope==='workspace'?'outer-guide':'inner-guide'} ${guide.edge==='center'?'stack-guide':''} ${ready?.key===guide.key?'ready':''}`}
          data-dock-scope={guide.scope} data-dock-edge={guide.edge} data-dock-target={guide.target} role="img" aria-label={guide.label}
          style={{left:guide.button.x,top:guide.button.y,width:guide.button.width,height:guide.button.height}}>
          <Icon name={dockIconNames[guide.edge]} size={guide.edge==='center'?16:19}/>
        </div>)}
    </>}
    {ready&&<div className="dock-placement-preview intentional-dock-preview" aria-label="面板落位预览" style={{left:ready.preview.x,top:ready.preview.y,width:ready.preview.width,height:ready.preview.height}}/>}
  </div>;
}
