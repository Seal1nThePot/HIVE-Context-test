export type Rect = { x: number; y: number; width: number; height: number };
export type DockEdge = "left" | "right" | "top" | "bottom";
export type DockPlacementEdge = DockEdge | "center";
export type PanelGroup = { type:"group"; id:string; panels:string[]; active:string };
export type DockTree =
  | { type: "panel"; panel: string }
  | PanelGroup
  | { type: "split"; id: string; axis: "x" | "y"; ratio: number; a: DockTree; b: DockTree };
export const leaf = (panel: string): DockTree => ({ type: "panel", panel });
export function initialDockTree(): DockTree {
  return { type: "split", id: "initial-files", axis: "x", ratio: .2, a: leaf("files"),
    b: { type: "split", id: "initial-chat", axis: "x", ratio: .68, a: leaf("editor"), b: leaf("conversation") } };
}
export function dockedPanels(tree: DockTree | null): string[] {
  return !tree ? [] : tree.type === "panel" ? [tree.panel] : tree.type==='group'?[...tree.panels]:[...dockedPanels(tree.a), ...dockedPanels(tree.b)];
}
export function removeDockPanel(tree: DockTree | null, panel: string): DockTree | null {
  if (!tree) return null;
  if (tree.type === "panel") return tree.panel === panel ? null : tree;
  if(tree.type==='group'){
    const panels=tree.panels.filter(id=>id!==panel);
    return !panels.length?null:panels.length===1?leaf(panels[0]):{...tree,panels,active:panels.includes(tree.active)?tree.active:panels[0]};
  }
  const a = removeDockPanel(tree.a, panel), b = removeDockPanel(tree.b, panel);
  return !a ? b : !b ? a : a === tree.a && b === tree.b ? tree : { ...tree, a, b };
}
export function insertDockPanel(tree: DockTree | null, panel: string, target: string, edge: DockEdge, splitId: string = crypto.randomUUID()): DockTree {
  if (panel === target && dockedPanels(tree).includes(panel)) return tree!;
  const rest = removeDockPanel(tree, panel);
  if (!rest) return leaf(panel);
  const add = (node: DockTree): DockTree => {
    if (node.type !== "split") {
      if (!dockedPanels(node).includes(target)) return node;
      const before = edge === "left" || edge === "top";
      return { type: "split", id: splitId, axis: edge === "left" || edge === "right" ? "x" : "y", ratio: .5,
        a: before ? leaf(panel) : node, b: before ? node : leaf(panel) };
    }
    return { ...node, a: add(node.a), b: add(node.b) };
  };
  return add(rest);
}
export function resizeDockSplit(tree: DockTree | null, id: string, ratio: number): DockTree | null {
  if (!tree || tree.type !== "split") return tree;
  return tree.id === id ? { ...tree, ratio: Math.max(.12, Math.min(.88, ratio)) }
    : { ...tree, a: resizeDockSplit(tree.a, id, ratio)!, b: resizeDockSplit(tree.b, id, ratio)! };
}
// Outer guides add a column/row around the whole workspace, retaining its inner ratios.
export function insertDockPanelAtRoot(tree:DockTree|null,panel:string,edge:DockEdge,splitId:string=crypto.randomUUID()):DockTree {
  const rest=removeDockPanel(tree,panel);if(!rest)return leaf(panel);
  const before=edge==='left'||edge==='top';
  return {type:'split',id:splitId,axis:edge==='left'||edge==='right'?'x':'y',ratio:before?.25:.75,a:before?leaf(panel):rest,b:before?rest:leaf(panel)};
}
export type Divider = { id: string; axis: "x" | "y"; rect: Rect; parent: Rect; ratio: number };
export function measureDockTree(tree: DockTree | null, bounds: Rect, gap = 5) {
  const panels: Record<string, Rect> = {}, dividers: Divider[] = [], groups:(PanelGroup&{rect:Rect})[]=[];
  const walk = (node: DockTree, rect: Rect) => {
    if (node.type === "panel") { panels[node.panel] = rect; return; }
    if(node.type==='group'){for(const id of node.panels)panels[id]=rect;groups.push({...node,rect});return;}
    const horizontal = node.axis === "x", extent = Math.max(0, (horizontal ? rect.width : rect.height) - gap);
    const size = extent * node.ratio;
    const first = { ...rect, [horizontal ? "width" : "height"]: size };
    const second = horizontal
      ? { ...rect, x: rect.x + size + gap, width: extent - size }
      : { ...rect, y: rect.y + size + gap, height: extent - size };
    const divider = horizontal ? { x: rect.x + size, y: rect.y, width: gap, height: rect.height }
      : { x: rect.x, y: rect.y + size, width: rect.width, height: gap };
    dividers.push({ id: node.id, axis: node.axis, rect: divider, parent: rect, ratio: node.ratio });
    walk(node.a, first); walk(node.b, second);
  };
  if (tree) walk(tree, bounds);
  return { panels, dividers, groups };
}
export function dockResizeEdges(tree: DockTree | null, panel: string): Partial<Record<DockEdge,string>> | null {
  if (!tree) return null;
  if (tree.type === "panel") return tree.panel === panel ? {} : null;
  if(tree.type==='group')return tree.panels.includes(panel)?{}:null;
  const a=dockResizeEdges(tree.a,panel), b=a===null?dockResizeEdges(tree.b,panel):null;
  const found=a??b;if(found===null)return null;
  const edge:DockEdge=tree.axis==='x'?(a!==null?'right':'left'):(a!==null?'bottom':'top');
  return {...found,[edge]:found[edge]||tree.id};
}
export const PANEL_HEADER_HEIGHT = 28;
export function mergeDockPanel(tree:DockTree|null,panel:string,target:string,groupId:string=crypto.randomUUID()):DockTree{
  if(panel===target&&dockedPanels(tree).includes(panel))return activateDockPanel(tree,panel)!;
  const rest=removeDockPanel(tree,panel);if(!rest)return leaf(panel);
  const add=(node:DockTree):DockTree=>{
    if(node.type==='split')return {...node,a:add(node.a),b:add(node.b)};
    if(!dockedPanels(node).includes(target))return node;
    return node.type==='group'?{...node,panels:[...node.panels,panel],active:panel}
      :{type:'group',id:groupId,panels:[node.panel,panel],active:panel};
  };return add(rest);
}
export function activateDockPanel(tree:DockTree|null,panel:string):DockTree|null{
  if(!tree||tree.type==='panel')return tree;
  if(tree.type==='group')return tree.panels.includes(panel)?{...tree,active:panel}:tree;
  return {...tree,a:activateDockPanel(tree.a,panel)!,b:activateDockPanel(tree.b,panel)!};
}
type DockBranch = { id:string; side:'a'|'b' };
export type DockRestoreAnchor = {
  target:string; edge:DockPlacementEdge;
  split?:{id:string;axis:'x'|'y';ratio:number;siblings:string[];ancestors:DockBranch[]};
};
export function restoreDockAnchor(tree:DockTree|null,panel:string,ancestors:DockBranch[]=[]):DockRestoreAnchor|null{
  if(!tree||tree.type==='panel')return null;
  if(tree.type==='group')return tree.panels.includes(panel)?{target:tree.panels.find(id=>id!==panel)!,edge:'center'}:null;
  const side=dockedPanels(tree.a).includes(panel)?'a':dockedPanels(tree.b).includes(panel)?'b':null;
  if(!side)return null;
  const sibling=side==='a'?tree.b:tree.a;
  return restoreDockAnchor(tree[side],panel,[...ancestors,{id:tree.id,side}])||{
    target:dockedPanels(sibling)[0],edge:tree.axis==='x'?(side==='a'?'left':'right'):(side==='a'?'top':'bottom'),
    split:{id:tree.id,axis:tree.axis,ratio:tree.ratio,siblings:dockedPanels(sibling),ancestors},
  };
}
// Recreate only the split removed by hiding this panel. Its live sibling can be
// an entire subtree (e.g. editor + chat); splitting one leaf would change sizes.
export function restoreDockPanel(tree:DockTree|null,panel:string,anchor:DockRestoreAnchor):DockTree|null{
  const saved=anchor.split,rest=removeDockPanel(tree,panel);
  if(!saved||!rest)return null;
  const survivors=saved.siblings.filter(id=>dockedPanels(rest).includes(id));
  if(!survivors.length)return null;
  const findSplit=(node:DockTree,id:string):Extract<DockTree,{type:'split'}>|undefined=>
    node.type!=='split'?undefined:node.id===id?node:findSplit(node.a,id)||findSplit(node.b,id);
  let region:DockTree|undefined;
  for(const branch of [...saved.ancestors].reverse()){
    const ancestor=findSplit(rest,branch.id),candidate=ancestor?.[branch.side];
    if(candidate&&survivors.every(id=>dockedPanels(candidate).includes(id))){region=candidate;break;}
  }
  if(!region){
    if(!saved.ancestors.length)region=rest;
    else {
      const common=(node:DockTree):DockTree=>{
        if(node.type!=='split')return node;
        if(survivors.every(id=>dockedPanels(node.a).includes(id)))return common(node.a);
        if(survivors.every(id=>dockedPanels(node.b).includes(id)))return common(node.b);
        return node;
      };
      region=common(rest);
    }
  }
  const before=anchor.edge==='left'||anchor.edge==='top';
  const replace=(node:DockTree):DockTree=>node===region?
    {type:'split',id:saved.id,axis:saved.axis,ratio:saved.ratio,a:before?leaf(panel):node,b:before?node:leaf(panel)}:
    node.type==='split'?{...node,a:replace(node.a),b:replace(node.b)}:node;
  return replace(rest);
}
