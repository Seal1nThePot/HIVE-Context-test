import {dockedPanels,type Rect,type PanelGroup} from './panelLayout';
import type {AutoHidePlacement} from './autoHide';
import {hideWorkspacePanel,activateWorkspacePanel,placeWorkspaceGroup,type WorkspaceLayout} from './workspaceState';

/** Session-only native window state. It is deliberately separate from saved views. */
export type NativePanelHome={rect:Rect;placement?:AutoHidePlacement};
export function openNativePanel(layout:WorkspaceLayout,id:string):WorkspaceLayout {
  return activateWorkspacePanel({...layout,open:layout.open.includes(id)?layout.open:[...layout.open,id],minimized:layout.minimized.filter(value=>value!==id),autoHideActive:layout.autoHideActive===id?null:layout.autoHideActive},id);
}
export function canDetachDocumentTab(layout:WorkspaceLayout,id:string):boolean {
  const editor=(value:string)=>value==='editor'||value.startsWith('editor:');
  return editor(id)&&layout.open.includes(id)&&layout.open.filter(editor).length>=2;
}
export function returnNativeGroup(layout:WorkspaceLayout,group:PanelGroup,rect:Rect):WorkspaceLayout {
  const panels=group.panels.filter(id=>layout.open.includes(id));if(!panels.length)return layout;
  const active=panels.includes(group.active)?group.active:panels[0];
  if(panels.every(id=>dockedPanels(layout.tree).includes(id)))return activateWorkspacePanel(layout,active);
  return placeWorkspaceGroup(layout,{...group,panels,active},'editor','right',rect);
}
export function minimizeNativePanel(layout:WorkspaceLayout,id:string,rect:Rect,placement:AutoHidePlacement):WorkspaceLayout {
  // Existing autoHide entries take the collapse path; update them before collapsing.
  const next=layout.autoHide?.[id]?{...layout,autoHide:{...layout.autoHide,[id]:{...placement,rect}}}:layout;
  return hideWorkspacePanel(next,id,rect,true,{...placement,rect});
}

/** The same captured pointer continues while a native document is connecting. */
export class NativeDragHandoff {
  private point:{x:number;y:number};
  phase:'pending'|'dragging'|'ended'|'cancelled'='pending';
  constructor(private rect:Rect,private origin:{x:number;y:number}){this.point=origin;}
  move(point:{x:number;y:number}){if(this.phase!=='cancelled'&&this.phase!=='ended')this.point=point;}
  placement():Rect{return {...this.rect,x:this.rect.x+this.point.x-this.origin.x,y:this.rect.y+this.point.y-this.origin.y};}
  ready(){if(this.phase==='pending'){this.phase='dragging';return true;}return false;}
  end(){if(this.phase!=='cancelled')this.phase='ended';}
  cancel(){this.phase='cancelled';}
}
