import {dockedPanels,leaf,measureDockTree,type DockTree,type Rect} from './panelLayout';
import {findPanelGroup} from './workspaceState';
import {detachWorkspacePanel,openWorkspacePanel,placeWorkspacePanel,placeWorkspacePanelAtEdge,type WorkspaceLayout} from './workspaceState';
import {releaseAutoHidePanel} from './autoHide';

export const PRIMARY_EDITOR='editor';
export const isEditorPanel=(id:string)=>id===PRIMARY_EDITOR||id.startsWith('editor:');

export function positionLockMembers(layout:WorkspaceLayout,id:string):string[] {
  return findPanelGroup(layout.tree,id)?.panels||layout.floatingGroups.find(group=>group.panels.includes(id))?.panels||[id];
}
export function isPanelPositionLocked(layout:WorkspaceLayout,id:string):boolean {
  return positionLockMembers(layout,id).some(panel=>layout.lockedPanels?.includes(panel));
}
export function togglePanelPositionLock(layout:WorkspaceLayout,id:string):WorkspaceLayout {
  if(id===PRIMARY_EDITOR)return layout;
  const members=positionLockMembers(layout,id).filter(panel=>panel!==PRIMARY_EDITOR),locked=new Set(layout.lockedPanels||[]);
  if(isPanelPositionLocked(layout,id))members.forEach(panel=>locked.delete(panel));else members.forEach(panel=>locked.add(panel));
  return {...layout,lockedPanels:[...locked]};
}
export function canResizeSplit(layout:WorkspaceLayout,splitId:string):boolean {
  if(layout.locked)return false;
  const find=(node:DockTree|null):DockTree|null=>!node||node.type!=='split'?null:node.id===splitId?node:find(node.a)||find(node.b);
  return !dockedPanels(find(layout.tree)).some(id=>isPanelPositionLocked(layout,id));
}

/** Old views and already-open pages must also retain a visible, independent main document. */
export function retainPrimaryEditor(layout:WorkspaceLayout):WorkspaceLayout {
  let next=layout;
  if(next.autoHide?.editor)next=releaseAutoHidePanel(next,PRIMARY_EDITOR);
  if(next.floatingGroups.some(group=>group.panels.includes(PRIMARY_EDITOR)))next=detachWorkspacePanel(next,PRIMARY_EDITOR);
  const separate=(node:DockTree|null):DockTree|null=>{
    if(!node||node.type==='panel')return node;
    if(node.type==='split')return {...node,a:separate(node.a)!,b:separate(node.b)!};
    if(!node.panels.includes(PRIMARY_EDITOR)||node.panels.every(isEditorPanel))return node;
    const panels=node.panels.filter(id=>id!==PRIMARY_EDITOR);
    if(!panels.length)return leaf(PRIMARY_EDITOR);
    return {type:'split',id:'primary:'+node.id,axis:'x',ratio:.75,a:leaf(PRIMARY_EDITOR),b:panels.length===1?leaf(panels[0]):{...node,panels,active:panels.includes(node.active)?node.active:panels[0]}};
  };
  let tree=separate(next.tree);
  if(!dockedPanels(tree).includes(PRIMARY_EDITOR))tree=tree?{type:'split',id:'primary:restore',axis:'x',ratio:.75,a:leaf(PRIMARY_EDITOR),b:tree}:leaf(PRIMARY_EDITOR);
  return {...next,tree,open:next.open.includes(PRIMARY_EDITOR)?next.open:[PRIMARY_EDITOR,...next.open],minimized:next.minimized.filter(id=>id!==PRIMARY_EDITOR)};
}
export function isFreelyMovableTool(layout:WorkspaceLayout,id:string):boolean {
  const group=layout.floatingGroups.find(value=>value.id===id||value.panels.includes(id));
  const members=group?.panels||[id];
  return members.every(panel=>!isEditorPanel(panel)&&!layout.autoHide?.[panel]&&!dockedPanels(layout.tree).includes(panel));
}
export function canMovePanel(layout:WorkspaceLayout,id:string):boolean {
  if(isFreelyMovableTool(layout,id))return true;
  if(id===PRIMARY_EDITOR||isPanelPositionLocked(layout,id))return false;
  if(layout.locked&&dockedPanels(layout.tree).includes(id))return false;
  return !isEditorPanel(id)||layout.open.filter(isEditorPanel).length>=2;
}
export function canPlacePanel(layout:WorkspaceLayout,id:string,target:string,edge:string):boolean {
  const group=(node:DockTree|null):string[]=>!node||node.type==='panel'?[]:node.type==='split'?[...group(node.a),...group(node.b)]:node.panels.includes(PRIMARY_EDITOR)?node.panels:[];
  if(!canMovePanel(layout,id)||isPanelPositionLocked(layout,id)||target&&isPanelPositionLocked(layout,target)||!target&&dockedPanels(layout.tree).some(panel=>isPanelPositionLocked(layout,panel))||edge==='center'&&(target===PRIMARY_EDITOR||group(layout.tree).includes(target))&&!isEditorPanel(id))return false;
  if(!layout.locked)return true;
  return edge==='center'&&!dockedPanels(layout.tree).includes(target)&&!!target;
}
/** Compact ranks prevent old view values or repeated focus from overtaking controls. */
export function rankedFloatingLayers(layers:Record<string,number>,raised?:string):Record<string,number> {
  const ids=Object.keys(layers).filter(id=>id!==raised).sort((a,b)=>(layers[a]||0)-(layers[b]||0));
  if(raised)ids.push(raised);
  return Object.fromEntries(ids.map((id,index)=>[id,100+Math.min(index,350)*2]));
}
export const panelLayers={docked:1,tabs:3,floating:100} as const;
export function openDockedPanel(layout:WorkspaceLayout,id:string,rect:Rect):WorkspaceLayout {
  if(dockedPanels(layout.tree).includes(id))return openWorkspacePanel(layout,id,rect);
  const placement=layout.autoHide?.[id];
  if(placement){
    if(layout.locked||isPanelPositionLocked(layout,id))return openWorkspacePanel(layout,id,rect);
    const edge=placement.edge==='left'?'left':'right';
    const measured=measureDockTree(layout.tree,{x:0,y:0,width:1,height:1},0).panels;
    const candidates=Object.entries(measured).filter(([panel,box])=>!isEditorPanel(panel)&&
      Math.abs(edge==='left'?box.x:box.x+box.width-1)<.00001);
    const distance=(box:Rect)=>placement.offset<box.y?box.y-placement.offset:placement.offset>box.y+box.height?placement.offset-box.y-box.height:0;
    candidates.sort((a,b)=>distance(a[1])-distance(b[1]));
    const target=candidates[0]?.[0];
    if(target&&isPanelPositionLocked(layout,target))return openWorkspacePanel(layout,id,rect);
    if(!target&&dockedPanels(layout.tree).some(panel=>isPanelPositionLocked(layout,panel)))return openWorkspacePanel(layout,id,rect);
    return retainPrimaryEditor(target?placeWorkspacePanel(layout,id,target,edge,rect):placeWorkspacePanelAtEdge(layout,id,edge));
  }
  const next=releaseAutoHidePanel(detachWorkspacePanel(layout,id),id);
  const restored=openWorkspacePanel({...next,open:next.open.filter(value=>value!==id),minimized:next.minimized.filter(value=>value!==id)},id,rect);
  return retainPrimaryEditor(dockedPanels(restored.tree).includes(id)?restored:placeWorkspacePanel(restored,id,PRIMARY_EDITOR,'right',rect));
}
export function openContentsPanel(layout:WorkspaceLayout,rect:Rect):WorkspaceLayout {
  if(layout.open.includes('toc')||layout.restore.toc||layout.autoHide?.toc||layout.rects.toc||layout.locked||isPanelPositionLocked(layout,'files'))return openWorkspacePanel(layout,'toc',rect);
  return dockedPanels(layout.tree).includes('files')?placeWorkspacePanel(layout,'toc','files','center',rect):placeWorkspacePanelAtEdge(layout,'toc','left');
}
export function openTrashPanel(layout:WorkspaceLayout,rect:Rect):WorkspaceLayout {
  if(layout.open.includes('trash')||layout.restore.trash||layout.autoHide?.trash||layout.rects.trash||layout.locked||isPanelPositionLocked(layout,'files'))return openWorkspacePanel(layout,'trash',rect);
  return dockedPanels(layout.tree).includes('files')?placeWorkspacePanel(layout,'trash','files','center',rect):openWorkspacePanel(layout,'trash',rect);
}
export function fitPanelInStage(rect:Rect,bounds:Rect):Rect {
  const width=Math.min(rect.width,bounds.width),height=Math.min(rect.height,bounds.height);
  return {width,height,x:Math.max(bounds.x,Math.min(rect.x,bounds.x+bounds.width-width)),y:Math.max(bounds.y,Math.min(rect.y,bounds.y+bounds.height-height))};
}

export function canDockAutoHideRail(layout:WorkspaceLayout,edge:'left'|'right'):boolean {
  const ids=Object.entries(layout.autoHide||{}).filter(([,placement])=>placement.edge===edge).map(([id])=>id);
  return !!ids.length&&!!layout.tree&&!layout.locked&&![...dockedPanels(layout.tree),...ids].some(id=>isPanelPositionLocked(layout,id));
}
/** Pull every icon on one rail into a single side column, preserving rail order. */
export function dockAutoHideRail(layout:WorkspaceLayout,edge:'left'|'right',width:number,workspaceWidth:number):WorkspaceLayout {
  const items=Object.entries(layout.autoHide||{}).filter(([,placement])=>placement.edge===edge);
  if(!canDockAutoHideRail(layout,edge)||!Number.isFinite(width)||!Number.isFinite(workspaceWidth)||workspaceWidth<=0)return layout;
  const upper=items.filter(([,p])=>p.offset<.5).map(([id])=>id),lower=items.filter(([,p])=>p.offset>=.5).map(([id])=>id);
  const node=(members:string[]):DockTree|null=>!members.length?null:members.length===1?leaf(members[0]):{type:'group',id:'rail-group:'+crypto.randomUUID(),panels:members,active:members.includes(layout.autoHideActive||'')?layout.autoHideActive!:members[0]};
  const top=node(upper),bottom=node(lower);
  const column:DockTree=top&&bottom?{type:'split',id:'rail-vertical:'+crypto.randomUUID(),axis:'y',ratio:.5,a:top,b:bottom}:(top||bottom)!;
  let next=layout;for(const [id] of items)next=releaseAutoHidePanel(detachWorkspacePanel(next,id),id);
  const sideRatio=Math.max(.12,Math.min(.4,width/workspaceWidth));
  const tree:DockTree={type:'split',id:'rail-column:'+crypto.randomUUID(),axis:'x',ratio:edge==='left'?sideRatio:1-sideRatio,a:edge==='left'?column:next.tree!,b:edge==='left'?next.tree!:column};
  const ids=items.map(([id])=>id);
  return {...next,tree,open:[...next.open.filter(id=>!ids.includes(id)),...ids],minimized:next.minimized.filter(id=>!ids.includes(id))};
}
