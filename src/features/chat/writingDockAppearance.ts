export type WritingDockAppearance={
  frame:{background:string;border:string;borderWidth:number;borderRadius:number;shadow:string};
  aiButton:{background:string;icon:string;hoverIcon:string;border:string;borderWidth:number;borderRadius:number};
  sideButtons:{background:string;icon:string;border:string;borderWidth:number;borderRadius:number;activeIcon:string;activeBackground:string;activeBorder:string;hoverIcon:string;hoverBackground:string};
};
export const defaultWritingDock:WritingDockAppearance={
  frame:{background:'#27301ff2',border:'#667044',borderWidth:1,borderRadius:20,shadow:'#00000066'},
  aiButton:{background:'accent',icon:'#edf0e7',hoverIcon:'#edf0e7',border:'#edf0e7',borderWidth:1,borderRadius:26},
  sideButtons:{background:'#00000000',icon:'#a9b58b',border:'#00000000',borderWidth:1,borderRadius:10,activeIcon:'#d9d3a0',activeBackground:'#c4b97112',activeBorder:'#b9ae6d33',hoverIcon:'#e6e2bd',hoverBackground:'#bac28a17'},
};
function record(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function color(value:unknown,fallback:string){return typeof value==='string'&&/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)?value.toLowerCase():fallback;}
function number(value:unknown,fallback:number,max:number){return typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(max,value)):fallback;}
/** Old themes inherit their existing rendered colors once; later changes stay independent. */
export function normalizeWritingDock(value:unknown,legacyColor:(color:string)=>string=color=>color):WritingDockAppearance{
  const input=record(value),frame=record(input.frame),ai=record(input.aiButton),sides=record(input.sideButtons);
  const f=defaultWritingDock.frame,a=defaultWritingDock.aiButton,s=defaultWritingDock.sideButtons;
  const inherited=(value:unknown,fallback:string)=>color(value,'')||legacyColor(fallback);
  return {
    frame:{background:inherited(frame.background,f.background),border:inherited(frame.border,f.border),borderWidth:number(frame.borderWidth,f.borderWidth,8),borderRadius:number(frame.borderRadius,f.borderRadius,100),shadow:inherited(frame.shadow,f.shadow)},
    aiButton:{background:ai.background==='accent'?'accent':color(ai.background,a.background),icon:color(ai.icon,a.icon),hoverIcon:color(ai.hoverIcon,a.hoverIcon),border:color(ai.border,a.border),borderWidth:number(ai.borderWidth,a.borderWidth,8),borderRadius:number(ai.borderRadius,a.borderRadius,100)},
    sideButtons:{background:inherited(sides.background,s.background),icon:inherited(sides.icon,s.icon),border:inherited(sides.border,s.border),borderWidth:number(sides.borderWidth,s.borderWidth,8),borderRadius:number(sides.borderRadius,s.borderRadius,100),activeIcon:inherited(sides.activeIcon,s.activeIcon),activeBackground:inherited(sides.activeBackground,s.activeBackground),activeBorder:inherited(sides.activeBorder,s.activeBorder),hoverIcon:inherited(sides.hoverIcon,s.hoverIcon),hoverBackground:inherited(sides.hoverBackground,s.hoverBackground)},
  };
}
export function writingDockTokens(dock:WritingDockAppearance,accent:string):Record<string,string>{
  const {frame:f,aiButton:a,sideButtons:s}=dock,px=(value:number)=>`calc(${value}px * var(--ui-scale))`;
  return {'--hive-dock-frame-bg':f.background,'--hive-dock-frame-border':f.border,'--hive-dock-frame-width':px(f.borderWidth),'--hive-dock-frame-radius':px(f.borderRadius),'--hive-dock-frame-shadow':f.shadow,
    '--hive-dock-ai-bg':a.background==='accent'?accent:a.background,'--hive-dock-ai-icon':a.icon,'--hive-dock-ai-hover-icon':a.hoverIcon,'--hive-dock-ai-border':a.border,'--hive-dock-ai-width':px(a.borderWidth),'--hive-dock-ai-radius':px(a.borderRadius),
    '--hive-dock-side-bg':s.background,'--hive-dock-side-icon':s.icon,'--hive-dock-side-border':s.border,'--hive-dock-side-width':px(s.borderWidth),'--hive-dock-side-radius':px(s.borderRadius),'--hive-dock-side-active-icon':s.activeIcon,'--hive-dock-side-active-bg':s.activeBackground,'--hive-dock-side-active-border':s.activeBorder,'--hive-dock-side-hover-icon':s.hoverIcon,'--hive-dock-side-hover-bg':s.hoverBackground};
}
