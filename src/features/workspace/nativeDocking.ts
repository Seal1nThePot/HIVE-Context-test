import {removeDockPanel,type DockTree,type Rect} from './panelLayout';
import type {WorkspaceLayout} from './workspaceState';

/** Keep home anchors for return, but measure only panels still inside the main window. */
export function visibleDockTree(tree:DockTree|null,detached:Iterable<string>):DockTree|null {
  let result=tree;for(const id of detached)result=removeDockPanel(result,id);return result;
}
export function visibleFloatingGroups(groups:WorkspaceLayout['floatingGroups'],detached:ReadonlySet<string>){
  return groups.flatMap(group=>{const panels=group.panels.filter(id=>!detached.has(id));return panels.length?[{...group,panels,active:panels.includes(group.active)?group.active:panels[0]}]:[];});
}
export function railDropAt(point:{x:number;y:number},bounds:Rect,viewportWidth:number){
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.y<bounds.y||point.y>bounds.y+bounds.height)return null;
  const edge=point.x>=-12&&point.x<=Math.max(24,bounds.x+12)?'left':point.x>=Math.min(viewportWidth-24,bounds.x+bounds.width-12)&&point.x<=viewportWidth+12?'right':null;
  return edge?{edge,offset:point.y<bounds.y+bounds.height/2?.25:.75,rect:{x:edge==='left'?0:viewportWidth-28,y:bounds.y,width:28,height:bounds.height}} as const:null;
}
