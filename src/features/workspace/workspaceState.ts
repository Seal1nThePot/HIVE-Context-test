import { activateDockPanel, dockedPanels, initialDockTree, insertDockPanel, insertDockPanelAtRoot, mergeDockPanel, removeDockPanel, restoreDockAnchor, restoreDockPanel, type DockEdge, type DockPlacementEdge, type DockRestoreAnchor, type DockTree, type PanelGroup, type Rect } from "./panelLayout";
import {collapseAutoHidePanel,expandAutoHidePanel,releaseAutoHidePanel,type AutoHidePlacement} from './autoHide';
export type WorkspaceLayout={tree:DockTree|null;open:string[];minimized:string[];rects:Record<string,Rect>;layers:Record<string,number>;floatingGroups:PanelGroup[];restore:Record<string,DockRestoreAnchor>;autoHide?:Record<string,AutoHidePlacement>;autoHideActive?:string|null;locked?:boolean;lockedPanels?:string[]};
export const defaultWorkspace=():WorkspaceLayout=>({tree:initialDockTree(),open:['files','editor','conversation'],minimized:[],rects:{},layers:{},floatingGroups:[],restore:{}});
export function completeWorkspace(value:WorkspaceLayout):WorkspaceLayout{return {...value,minimized:value.minimized||[],floatingGroups:value.floatingGroups||[],restore:value.restore||{}};}
export function findPanelGroup(tree:DockTree|null,panel:string):PanelGroup|undefined{
  if(!tree||tree.type==='panel')return;
  if(tree.type==='group')return tree.panels.includes(panel)?tree:undefined;
  return findPanelGroup(tree.a,panel)||findPanelGroup(tree.b,panel);
}
export function detachWorkspacePanel(layout:WorkspaceLayout,id:string):WorkspaceLayout{
  const rects={...layout.rects},floatingGroups:PanelGroup[]=[];
  for(const group of layout.floatingGroups){
    if(!group.panels.includes(id)){floatingGroups.push(group);continue;}
    const panels=group.panels.filter(value=>value!==id);
    if(panels.length===1&&rects[group.id])rects[panels[0]]=rects[group.id];
    else if(panels.length>1)floatingGroups.push({...group,panels,active:panels.includes(group.active)?group.active:panels[0]});
  }
  return {...layout,tree:removeDockPanel(layout.tree,id),rects,floatingGroups};
}
export function floatWorkspaceGroup(layout:WorkspaceLayout,group:PanelGroup,rect:Rect):WorkspaceLayout {
  let next=layout;
  for(const id of group.panels)next=releaseAutoHidePanel(detachWorkspacePanel(next,id),id);
  return {...next,floatingGroups:[...next.floatingGroups,group],rects:{...next.rects,[group.id]:rect},layers:rankedGroupLayer(next.layers,group.id)};
}
function rankedGroupLayer(layers:Record<string,number>,id:string):Record<string,number>{return {...layers,[id]:Math.max(100,...Object.values(layers).filter(Number.isFinite))+2};}
export function placeWorkspaceGroup(layout:WorkspaceLayout,group:PanelGroup,target:string,edge:DockPlacementEdge,rect:Rect,atRoot=false):WorkspaceLayout {
  let next=layout;
  for(const id of group.panels)next=detachWorkspacePanel(next,id);
  const [first,...rest]=group.panels;
  next=atRoot?placeWorkspacePanelAtEdge(next,first,edge as DockEdge):placeWorkspacePanel(next,first,target,edge,rect);
  for(const id of rest)next=placeWorkspacePanel(next,id,first,'center',rect);
  return activateWorkspacePanel(next,group.active);
}
export function activateWorkspacePanel(layout:WorkspaceLayout,id:string):WorkspaceLayout{
  return {...layout,tree:activateDockPanel(layout.tree,id),floatingGroups:layout.floatingGroups.map(group=>group.panels.includes(id)?{...group,active:id}:group)};
}
export function placeWorkspacePanelAtEdge(layout:WorkspaceLayout,id:string,edge:DockEdge):WorkspaceLayout{
  const next=releaseAutoHidePanel(detachWorkspacePanel(layout,id),id);
  return {...next,tree:insertDockPanelAtRoot(next.tree,id,edge),open:next.open.includes(id)?next.open:[...next.open,id],minimized:next.minimized.filter(value=>value!==id)};
}
export function placeWorkspacePanel(layout:WorkspaceLayout,id:string,target:string,edge:DockPlacementEdge,fallback:Rect):WorkspaceLayout{
  if(id===target)return activateWorkspacePanel(layout,id);
  let next=releaseAutoHidePanel(detachWorkspacePanel(layout,id),id);
  if(next.autoHide?.[target])next={...releaseAutoHidePanel(next,target),rects:{...next.rects,[target]:fallback}};
  if(edge==='center'&&!dockedPanels(next.tree).includes(target)&&next.open.includes(target)){
    const existing=next.floatingGroups.find(group=>group.panels.includes(target));
    const group:PanelGroup=existing?{...existing,panels:[...existing.panels,id],active:id}:{type:'group',id:'group:'+crypto.randomUUID(),panels:[target,id],active:id};
    const rect=next.rects[existing?.id||target]||fallback;
    next={...next,floatingGroups:[...next.floatingGroups.filter(value=>value.id!==existing?.id),group],rects:{...next.rects,[group.id]:rect},layers:{...next.layers,[group.id]:Math.max(next.layers[id]||30,next.layers[target]||30)}};
  }else{
    const remaining=dockedPanels(next.tree),actualTarget=remaining.includes(target)?target:remaining.find(value=>value.startsWith('editor'))||remaining.at(-1)||'';
    next={...next,tree:edge==='center'?mergeDockPanel(next.tree,id,actualTarget):insertDockPanel(next.tree,id,actualTarget,edge)};
  }
  return {...next,open:next.open.includes(id)?next.open:[...next.open,id],minimized:next.minimized.filter(value=>value!==id)};
}
export function hideWorkspacePanel(layout:WorkspaceLayout,id:string,rect:Rect,minimize:boolean,placement?:AutoHidePlacement):WorkspaceLayout{
  if(layout.autoHide?.[id]){
    if(minimize)return collapseAutoHidePanel(layout,id);
    const next=releaseAutoHidePanel(layout,id);return {...next,open:next.open.filter(value=>value!==id),minimized:next.minimized.filter(value=>value!==id)};
  }
  const group=layout.floatingGroups.find(value=>value.panels.includes(id));
  let anchor:DockRestoreAnchor|null=group?{target:group.panels.find(value=>value!==id)!,edge:'center'}:restoreDockAnchor(layout.tree,id);
  if(anchor?.split){
    // An outer split may already have collapsed because another panel is hidden.
    // Retain that missing ancestry so reopening panels in either order is stable.
    let context:typeof anchor.split.ancestors=[];
    for(const [hidden,previous] of Object.entries(layout.restore)){
      if(layout.open.includes(hidden)||!previous.split?.siblings.includes(id)||previous.split.id===anchor.split.id)continue;
      const ancestors=[...previous.split.ancestors,{id:previous.split.id,side:previous.edge==='left'||previous.edge==='top'?'b' as const:'a' as const}];
      if(ancestors.length>context.length)context=ancestors;
    }
    const ids=new Set(context.map(branch=>branch.id));
    anchor={...anchor,split:{...anchor.split,ancestors:[...context,...anchor.split.ancestors.filter(branch=>!ids.has(branch.id))]}};
  }
  const next=detachWorkspacePanel(layout,id);
  const restore={...next.restore};if(anchor)restore[id]=anchor;else delete restore[id];
  return {...next,open:next.open.filter(value=>value!==id),minimized:minimize?[...next.minimized.filter(value=>value!==id),id]:next.minimized.filter(value=>value!==id),rects:{...next.rects,[id]:rect},restore,...(minimize&&placement?{autoHide:{...next.autoHide,[id]:placement}}:{})};
}
export function closeWorkspacePanelPreservingAutoHide(layout:WorkspaceLayout,id:string,rect:Rect):WorkspaceLayout {
  return layout.autoHide?.[id]?collapseAutoHidePanel(layout,id):hideWorkspacePanel(layout,id,rect,false);
}
export function openWorkspacePanel(layout:WorkspaceLayout,id:string,rect:Rect):WorkspaceLayout{
  if(layout.autoHide?.[id])return expandAutoHidePanel(layout,id);
  if(layout.open.includes(id))return activateWorkspacePanel(layout,id);
  const anchor=layout.restore[id];
  if(anchor?.split){
    const tree=restoreDockPanel(layout.tree,id,anchor);
    if(tree)return {...layout,tree,open:[...layout.open,id],minimized:layout.minimized.filter(value=>value!==id)};
  }
  if(anchor&&layout.open.includes(anchor.target))return placeWorkspacePanel(layout,id,anchor.target,anchor.edge,rect);
  return {...layout,open:[...layout.open,id],minimized:layout.minimized.filter(value=>value!==id),rects:{...layout.rects,[id]:rect}};
}
