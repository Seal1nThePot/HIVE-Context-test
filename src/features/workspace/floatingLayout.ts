import {activateDockPanel,dockedPanels,insertDockPanel,leaf,mergeDockPanel,removeDockPanel,type DockTree,type DockPlacementEdge,type PanelGroup} from './panelLayout';

export type FloatingGroup=PanelGroup & {content?:DockTree};

/** Older floating groups are a single tab strip; split hosts use the same tree as the main workspace. */
export function floatingContent(group:FloatingGroup):DockTree {
  return group.content||{type:'group',id:group.id,panels:group.panels,active:group.active};
}

export function pruneFloatingGroup(group:FloatingGroup, panels:string[], active=group.active):FloatingGroup {
  let content=group.content;
  if(content){
    for(const member of dockedPanels(content))if(!panels.includes(member))content=removeDockPanel(content||null,member)??undefined;
    if(content&&panels.includes(active))content=activateDockPanel(content,active)??undefined;
  }
  return {...group,panels,active:panels.includes(active)?active:panels[0],...(group.content?{content}:{})};
}

export function insertFloatingContent(target:DockTree,member:string,moving:DockTree,active:string,edge:DockPlacementEdge):DockTree {
  const members=dockedPanels(moving);
  if(edge==='center')return activateDockPanel(members.reduce((tree,id)=>mergeDockPanel(tree,id,member),target),active)!;
  const marker='placeholder:'+crypto.randomUUID();
  const replace=(node:DockTree):DockTree=>{
    if(node.type==='panel')return node.panel===marker?moving:node;
    return node.type==='group'?node:{...node,a:replace(node.a),b:replace(node.b)};
  };
  return replace(insertDockPanel(target,marker,member,edge));
}

export function toFloatingGroup(content:DockTree,active:string,id='float:'+crypto.randomUUID()):FloatingGroup {
  const panels=dockedPanels(content);
  return {type:'group',id,panels,active:panels.includes(active)?active:panels[0],
    ...(content.type==='split'?{content}:{})};
}

export function floatingDropContent(target:FloatingGroup|undefined,targetId:string,source:FloatingGroup|undefined,sourceId:string,edge:DockPlacementEdge){
  return toFloatingGroup(insertFloatingContent(target?floatingContent(target):leaf(targetId),targetId,source?floatingContent(source):leaf(sourceId),sourceId,edge),sourceId,target?.id);
}
