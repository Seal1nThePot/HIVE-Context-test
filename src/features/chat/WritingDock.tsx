import {Highlighter,ListTree,PencilLine,WandSparkles} from 'lucide-react';
import {modeLabels,type Mode} from '../../shared/core';
import './writing-dock.css';
import {DockTooltip} from './DockTooltip';

export default function WritingDock({mode,continuationLimit,aiOpen,annotationTool,busy,onRun,onToggleAi,onAnnotate}:{mode:Mode;continuationLimit:number;aiOpen:boolean;annotationTool:boolean;busy?:boolean;onRun:(mode:Mode)=>void;onToggleAi:()=>void;onAnnotate:()=>void}){
  const modes=[{mode:'outline',Icon:ListTree},{mode:'edit',Icon:WandSparkles},{mode:'continue',Icon:PencilLine}] as const;
  function modeButton({mode:value,Icon}:typeof modes[number]){
    const hint=value==='continue'?`${modeLabels[value]} · 最多 ${continuationLimit} 字 · 点一下立即执行`:`${modeLabels[value]} · 点一下立即执行`;
    return <button key={value} type="button" className={'dock-mode-button '+(mode===value?'active':'')} aria-label={modeLabels[value]} aria-pressed={mode===value}
      data-tooltip={busy?'正在生成，请稍候':hint} disabled={busy} onClick={()=>onRun(value)}><Icon size={19}/></button>;
  }
  return <footer className="bottom-bar floating-mode-dock writing-dock" aria-label="写作快捷栏"><DockTooltip><div className="writing-dock-controls">
    <button type="button" className={'dock-mode-button dock-annotation-button'+(annotationTool?' active':'')} aria-label="标注工具" aria-pressed={annotationTool} data-tooltip={annotationTool?'标注工具已开启 · 选中文字添加要求 · Esc 退出':'标注工具 · 点击后选中文字'} onPointerDown={event=>event.preventDefault()} onClick={onAnnotate}><Highlighter size={19}/></button>
    {modes.slice(0,1).map(modeButton)}
    <button type="button" className={'dock-ai-button'+(aiOpen?' active':'')+(busy?' ai-running':'')} aria-label={aiOpen?'关闭 AI 面板':'打开 AI 面板'} aria-pressed={aiOpen} data-tooltip={aiOpen?'关闭 AI 面板':'打开 AI 面板'} onClick={onToggleAi}>
      <svg viewBox="0 0 32 32" width="29" height="29" aria-hidden="true"><path d="M16 1.5C18.1 11.3 20.7 13.9 30.5 16C20.7 18.1 18.1 20.7 16 30.5C13.9 20.7 11.3 18.1 1.5 16C11.3 13.9 13.9 11.3 16 1.5Z" fill="currentColor"/></svg>
    </button>
    {modes.slice(1).map(modeButton)}
  </div></DockTooltip></footer>;
}
