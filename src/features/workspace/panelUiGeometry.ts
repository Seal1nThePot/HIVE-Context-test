import type { Rect } from "./panelLayout";
export type Viewport = { width: number; height: number };
const clamp = (value:number,min:number,max:number) => Math.max(min,Math.min(max,value));
export function fitFloatingRect(rect:Rect,viewport:Viewport):Rect {
  const maxWidth=Math.max(1,viewport.width-16), maxHeight=Math.max(1,viewport.height-16);
  const width=clamp(rect.width,Math.min(190,maxWidth),maxWidth),height=clamp(rect.height,Math.min(180,maxHeight),maxHeight);
  return {x:clamp(rect.x,8,Math.max(8,viewport.width-width-8)),y:clamp(rect.y,8,Math.max(8,viewport.height-height-8)),width,height};
}
export function resizeFloatingRect(rect:Rect,edge:string,dx:number,dy:number,viewport:Viewport):Rect {
  const base=fitFloatingRect(rect,viewport),right=base.x+base.width,bottom=base.y+base.height;
  const minWidth=Math.min(190,viewport.width-16),minHeight=Math.min(180,viewport.height-16);
  let {x,y,width,height}=base;
  if(edge.includes('w')){x=clamp(base.x+dx,8,right-minWidth);width=right-x;}
  if(edge.includes('e'))width=clamp(base.width+dx,minWidth,viewport.width-base.x-8);
  if(edge.includes('n')){y=clamp(base.y+dy,8,bottom-minHeight);height=bottom-y;}
  if(edge.includes('s'))height=clamp(base.height+dy,minHeight,viewport.height-base.y-8);
  return fitFloatingRect({x,y,width,height},viewport);
}
export function placePanelActions(anchor:Rect,viewport:Viewport,count:number,scale=1,textScale=1) {
  const itemWidth=Math.max(158*scale,145*textScale),itemHeight=Math.max(30*scale,18*textScale+10*scale),gap=0,margin=8;
  const right=anchor.x+anchor.width+gap;
  const availableRight=viewport.width-margin-right;
  const orientation='vertical';
  const width=Math.min(itemWidth,Math.max(1,viewport.width-2*margin));
  const height=Math.min(count*itemHeight+2,Math.max(1,viewport.height-2*margin));
  const fitsRight=availableRight>=width;
  const x=fitsRight?right:clamp(anchor.x,margin,viewport.width-width-margin);
  const preferredY=fitsRight?anchor.y
    :anchor.y+anchor.height+gap+height+margin<=viewport.height?anchor.y+anchor.height+gap:anchor.y-height-gap;
  return {x:clamp(x,margin,Math.max(margin,viewport.width-width-margin)),y:clamp(preferredY,margin,Math.max(margin,viewport.height-height-margin)),width,height,orientation};
}
