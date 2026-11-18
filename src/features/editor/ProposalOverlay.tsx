import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {EditorView} from '@codemirror/view';
import {inlineProposalField,type InlineProposal} from './proposalInline';
import './proposalInline.css';

type Props={view:EditorView|null;proposal:InlineProposal|null;accept:()=>void;reject:(adjust?:boolean)=>void};

type Position={top:number;left:number;width:number};

const ICONS={
  adjust:'<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  reject:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  accept:'<path d="M20 6 9 17l-5-5"/>',
};

function Icon({name}:{name:keyof typeof ICONS}){
  return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{__html:ICONS[name]}}/>;
}

/** 建议上方那条很薄的操作条：浮在正文上，滚到框外时贴住视口顶部继续跟随，直到这段建议走完。 */
export function ProposalOverlay({view,proposal,accept,reject}:Props){
  const barRef=useRef<HTMLDivElement|null>(null);
  const [position,setPosition]=useState<Position|null>(null);
  const lastKey=useRef('');

  const measure=useCallback(()=>{
    if(!view||!proposal){
      if(lastKey.current!==''){lastKey.current='';setPosition(null);}
      return;
    }
    const live=view.state.field(inlineProposalField,false);
    const range=live?.proposal??proposal;
    const docLength=view.state.doc.length;
    const start0=Math.max(0,Math.min(range.from,docLength));
    const end0=Math.max(start0,Math.min(range.to,docLength));
    const raw=view.state.doc.sliceString(start0,end0);
    const from=start0+(raw.length-raw.trimStart().length);
    const to=Math.max(from,end0-(raw.length-raw.trimEnd().length));
    const scroller=view.scrollDOM.getBoundingClientRect();
    const content=view.contentDOM.getBoundingClientRect();
    const start=view.coordsAtPos(from);
    if(!start){
      if(lastKey.current!==''){lastKey.current='';setPosition(null);}
      return;
    }
    const end=(to>from?view.coordsAtPos(to):null)||start;
    const barHeight=barRef.current?.offsetHeight||24;
    const inset=content.width>320?50:8;
    const left=start.left;
    const width=Math.max(200,content.right-inset-left);
    const boxTop=start.top;
    const boxBottom=Math.max(end.bottom,start.bottom);
    // 框还在视口里才显示：整段滚出上方或下方就收起来。
    const visible=boxBottom>scroller.top+6&&boxTop<scroller.bottom-6;
    const minTop=scroller.top+6;
    const maxTop=Math.max(minTop,boxBottom-barHeight-8);
    const top=Math.min(Math.max(boxTop-barHeight-6,minTop),maxTop);
    const key=[Math.round(top),Math.round(left),Math.round(width),visible,range.stale?1:0].join(',');
    if(key===lastKey.current)return;
    lastKey.current=key;
    setPosition(visible?{top,left,width}:null);
  },[view,proposal]);

  const measureRef=useRef(measure);
  measureRef.current=measure;

  // 每次渲染后重量一次：正文增删、缩放、切换文档都会走到这里。
  useLayoutEffect(()=>{measure();});

  useEffect(()=>{
    if(!view)return;
    const handler=()=>measureRef.current();
    const scroller=view.scrollDOM;
    scroller.addEventListener('scroll',handler,{passive:true});
    window.addEventListener('resize',handler);
    const observer=new ResizeObserver(handler);
    observer.observe(scroller);
    observer.observe(view.contentDOM);
    return ()=>{
      scroller.removeEventListener('scroll',handler);
      window.removeEventListener('resize',handler);
      observer.disconnect();
    };
  },[view]);

  if(!proposal||!position)return null;
  const stale=proposal.stale;
  const tag=proposal.count?`${proposal.mode} · ${proposal.count} 字`:proposal.mode;
  const reason=stale?'这段文字已被改动，请先核对再决定':proposal.reason;
  return (
    <div ref={barRef} className={'proposal-bar'+(stale?' stale':'')} style={{top:position.top,left:position.left,width:position.width}}
      role="group" aria-label="AI 建议" onMouseDown={event=>event.preventDefault()}>
      <span className="proposal-bar-tag">{tag}</span>
      <span className="proposal-bar-reason" title={reason}>{reason}</span>
      <span className="proposal-bar-actions">
        <button type="button" className="proposal-bar-button adjust" title="撤掉并回到对话里继续调整" aria-label="撤掉并回到对话里继续调整" onClick={()=>reject(true)}><Icon name="adjust"/></button>
        <button type="button" className="proposal-bar-button reject" title="撤掉这段建议，恢复原样" aria-label="撤掉这段建议，恢复原样" onClick={()=>reject()}><Icon name="reject"/></button>
        <button type="button" className="proposal-bar-button accept" title={stale?'这段文字已被改动，请先核对':'保留这段建议（之后按 Ctrl+S 才写入磁盘）'} aria-label={stale?'这段文字已被改动，请先核对':'保留这段建议（之后按 Ctrl+S 才写入磁盘）'} onClick={accept}><Icon name="accept"/></button>
      </span>
    </div>
  );
}