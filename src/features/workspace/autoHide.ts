import type {DockEdge,Rect} from './panelLayout';
import type {WorkspaceLayout} from './workspaceState';
export type AutoHidePlacement={edge:DockEdge;offset:number;rect:Rect};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
export function nearestPanelEdge(rect:Rect,bounds:Rect,docked=false):DockEdge {
  const left=Math.abs(rect.x-bounds.x),right=Math.abs(rect.x+rect.width-bounds.x-bounds.width);
  if(docked&&rect.width<bounds.width*.9&&Math.min(left,right)<2)return left<=right?'left':'right';
  return rect.x+rect.width/2<=bounds.x+bounds.width/2?'left':'right';
}
export function panelAutoHidePlacement(rect:Rect,bounds:Rect,docked=false,edge=nearestPanelEdge(rect,bounds,docked)):AutoHidePlacement {
  const side=edge==='left'||edge==='right'?edge:nearestPanelEdge(rect,bounds,docked);
  const offset=(rect.y+14-bounds.y)/Math.max(1,bounds.height);
  return {edge:side,offset:clamp(offset,0,1),rect:{...rect,width:rect.width>bounds.width*.75?Math.min(380,bounds.width):rect.width}};
}
export function withAutoHideMetadata(layout:WorkspaceLayout,bounds:Rect):WorkspaceLayout {
  const autoHide={...layout.autoHide};
  for(const id of layout.minimized)if(!autoHide[id]){
    const rect=layout.rects[id]||{x:bounds.x,y:bounds.y,width:300,height:400},anchor=layout.restore[id];
    autoHide[id]=panelAutoHidePlacement(rect,bounds,!!anchor,anchor&&anchor.edge!=='center'?anchor.edge:undefined);
  }
  for(const [id,placement] of Object.entries(autoHide))if(placement.edge==='top'||placement.edge==='bottom')autoHide[id]=panelAutoHidePlacement(placement.rect,bounds);
  return {...layout,autoHide};
}
export function releaseAutoHidePanel(layout:WorkspaceLayout,id:string):WorkspaceLayout {
  if(!layout.autoHide?.[id])return layout;
  const autoHide={...layout.autoHide};delete autoHide[id];
  return {...layout,autoHide,autoHideActive:layout.autoHideActive===id?null:layout.autoHideActive};
}
export function collapseAutoHidePanel(layout:WorkspaceLayout,id:string):WorkspaceLayout {
  return {...layout,open:layout.open.filter(value=>value!==id),minimized:layout.minimized.includes(id)?layout.minimized:[...layout.minimized,id],autoHideActive:layout.autoHideActive===id?null:layout.autoHideActive};
}
export function repositionAutoHidePanel(layout:WorkspaceLayout,id:string,offset:number,edge?:'left'|'right'):WorkspaceLayout {
  const placement=layout.autoHide?.[id];
  if(!placement||!Number.isFinite(offset)||(edge!==undefined&&edge!=='left'&&edge!=='right'))return layout;
  const base=layout.autoHideActive===id?collapseAutoHidePanel(layout,id):layout;
  const autoHide={...base.autoHide};delete autoHide[id];
  return {...base,autoHide:{...autoHide,[id]:{...placement,edge:edge??placement.edge,offset:offset<.5?.25:.75}}};
}
export function expandAutoHidePanel(layout:WorkspaceLayout,id:string):WorkspaceLayout {
  const next=layout.autoHideActive&&layout.autoHideActive!==id?collapseAutoHidePanel(layout,layout.autoHideActive):layout;
  return {...next,open:next.open.includes(id)?next.open:[...next.open,id],minimized:next.minimized.filter(value=>value!==id),autoHideActive:id};
}
export function autoHidePanelRect(placement:AutoHidePlacement,bounds:Rect,anchor?:Rect):Rect {
  const width=clamp(placement.rect.width,Math.min(120,bounds.width),bounds.width),desiredHeight=clamp(placement.rect.height,Math.min(80,bounds.height),bounds.height);
  const vertical=placement.edge==='left'||placement.edge==='right';
  let height=desiredHeight;
  let y=vertical?clamp(anchor?.y??bounds.y+placement.offset*bounds.height-14,bounds.y,bounds.y+bounds.height-height):(placement.edge==='top'?bounds.y:bounds.y+bounds.height-height);
  if(vertical&&anchor){
    const minimum=Math.min(80,bounds.height),bottom=bounds.y+bounds.height;
    y=clamp(anchor.y,bounds.y,Math.max(bounds.y,bottom-minimum));
    height=Math.min(desiredHeight,bottom-y);
  }
  return {width,height,
    x:vertical?(placement.edge==='left'?bounds.x:bounds.x+bounds.width-width):clamp(anchor?.x??bounds.x+placement.offset*bounds.width-14,bounds.x,bounds.x+bounds.width-width),
    y};
}
export function placeRailIcons(items:{id:string;offset:number}[],length:number,size:number,gap:number){
  const positions=new Map<string,number>(),upper=items.filter(item=>item.offset<.5),lower=items.filter(item=>item.offset>=.5);
  let next=gap;
  for(const item of upper){positions.set(item.id,next);next+=size+gap;}
  next=Math.max(length/2+gap,next);
  for(const item of lower){positions.set(item.id,next);next+=size+gap;}
  const extent=Math.max(length,lower.length?next:upper.length*(size+gap)+gap);
  return {extent,positions};
}
