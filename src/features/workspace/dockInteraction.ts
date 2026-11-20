import {dockedPanels,insertDockPanel,insertDockPanelAtRoot,measureDockTree,removeDockPanel,type DockTree,type DockPlacementEdge,type DockEdge,type Rect} from './panelLayout';

type Point={x:number;y:number};
export type DockPointer=Point&{free?:boolean};
export type DockTarget={id:string;rect:Rect;floating:boolean;host?:string};
export type DockScene={panel:string;tree:DockTree|null;bounds:Rect;viewport:Rect;floating:{id:string;rect:Rect;layer:number;host?:string}[];scale:number;locked?:boolean;protectedPanels?:string[];positionLockedPanels?:string[];dedupeEquivalent?:boolean};
export type DockGuide={key:string;target:string;edge:DockPlacementEdge;scope:'panel'|'workspace';button:Rect;preview:Rect;label:string};
export type DockFeedback={visible:boolean;target:DockTarget|null;guides:DockGuide[];ready:DockGuide|null};
export const contains=(rect:Rect,point:Point)=>point.x>=rect.x&&point.x<=rect.x+rect.width&&point.y>=rect.y&&point.y<=rect.y+rect.height;
const empty=():DockFeedback=>({visible:false,target:null,guides:[],ready:null});
const names:Record<DockPlacementEdge,string>={left:'左分栏',right:'右分栏',top:'上分栏',bottom:'下分栏',center:'合并标签'};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
export function dockTargetAt(scene:DockScene,point:Point):DockTarget|null {
  const floating=[...scene.floating].sort((a,b)=>b.layer-a.layer).find(target=>target.id!==scene.panel&&contains(target.rect,point));
  if(floating)return {id:floating.id,rect:floating.rect,floating:true,host:floating.host};
  if(scene.locked)return null;
  if(!contains(scene.bounds,point))return null;
  const measured=measureDockTree(removeDockPanel(scene.tree,scene.panel),scene.bounds);
  for(const [id,rect] of Object.entries(measured.panels))if(contains(rect,point)){
    const group=measured.groups.find(group=>group.panels.includes(id));
    return {id:group?.active||id,rect,floating:false};
  }
  return null;
}
export function createDockGuides(scene:DockScene,target:DockTarget|null):DockGuide[] {
  const rest=removeDockPanel(scene.tree,scene.panel),guides:DockGuide[]=[],size=target?.host?Math.min(42*scene.scale,Math.max(12,Math.min(target.rect.width,target.rect.height)/4.5)):42*scene.scale,gap=5*scene.scale,step=size+gap;
  const button=(x:number,y:number,width=size):Rect=>({x:x-width/2,y:y-width/2,width,height:width});
  const add=(scope:DockGuide['scope'],edge:DockPlacementEdge,rect:Rect,preview:Rect,id='')=>guides.push({key:`${scope}:${id}:${edge}`,scope,edge,button:rect,preview,target:id,label:scope==='workspace'?({left:'新建左栏',right:'新建右栏',top:'新建上栏',bottom:'新建下栏'} as Record<string,string>)[edge]:names[edge]});
  const bounds=scene.bounds,margin=size/2+8;
  for(const edge of (target?.host||scene.locked||dockedPanels(scene.tree).some(id=>scene.positionLockedPanels?.includes(id))?[]:['left','right','top','bottom']) as DockEdge[]){
    const x=edge==='left'?bounds.x+margin:edge==='right'?bounds.x+bounds.width-margin:bounds.x+bounds.width/2;
    const y=edge==='top'?bounds.y+margin:edge==='bottom'?bounds.y+bounds.height-margin:bounds.y+bounds.height/2;
    const next=insertDockPanelAtRoot(rest,scene.panel,edge,'outer-preview');
    add('workspace',edge,button(x,y),measureDockTree(next,bounds).panels[scene.panel]);
  }
  if(target&&!scene.positionLockedPanels?.includes(target.id)){
    const area=target.host?target.rect:target.floating?scene.viewport:bounds,padding=step+size/2+10;
    const origin={x:target.rect.x+target.rect.width/2,y:target.rect.y+target.rect.height/2};
    const center={x:clamp(origin.x,area.x+padding,Math.max(area.x+padding,area.x+area.width-padding)),y:clamp(origin.y,area.y+padding,Math.max(area.y+padding,area.y+area.height-padding))};
    // Keep the nearby compass clear of the four outer workspace targets.
    if(guides.some(guide=>Math.abs(guide.button.x+size/2-center.x)<size+step&&Math.abs(guide.button.y+size/2-center.y)<size+step))center.y=clamp(center.y+(center.y<area.y+area.height/2?1:-1)*(step*2+size),area.y+padding,Math.max(area.y+padding,area.y+area.height-padding));
    if(!scene.locked)for(const [edge,dx,dy] of [['left',-1,0],['right',1,0],['top',0,-1],['bottom',0,1]] as const){
      const local=target.floating?{type:'panel' as const,panel:target.id}:rest;
      const next=insertDockPanel(local,scene.panel,target.id,edge,'panel-preview');
      add('panel',edge,button(center.x+dx*step,center.y+dy*step),measureDockTree(next,target.floating?target.rect:bounds).panels[scene.panel],target.id);
    }
    if(!scene.protectedPanels?.includes(target.id))add('panel','center',button(center.x,center.y,Math.min(34*scene.scale,size)),target.rect,target.id);
  }
  if(!scene.dedupeEquivalent)return guides;
  const results=new Set<string>(),structures=new Set<string>();
  const structure=(tree:DockTree):unknown=>tree.type==='split'?[tree.axis,structure(tree.a),structure(tree.b)]:tree.type==='group'?['tabs',tree.panels,tree.active]:tree.panel;
  return guides.filter(guide=>{
    if(guide.edge==='center'||target?.floating&&guide.scope==='panel')return true;
    const tree=guide.scope==='workspace'?insertDockPanelAtRoot(rest,scene.panel,guide.edge,'equivalent'):insertDockPanel(rest,scene.panel,guide.target,guide.edge,'equivalent');
    const measured=measureDockTree(tree,bounds);
    const topology=JSON.stringify(structure(tree));
    const signature=JSON.stringify({panels:Object.entries(measured.panels).sort(([a],[b])=>a.localeCompare(b)).map(([id,rect])=>[id,...[rect.x,rect.y,rect.width,rect.height].map(value=>Math.round(value*1000)/1000)]),groups:measured.groups.map(group=>[group.panels,group.active])});
    if(results.has(signature)||structures.has(topology))return false;
    results.add(signature);structures.add(topology);return true;
  });
}

/** The current preview is the drop result; no dwell or re-entry is required. */
export class DockIntent {
  private target:DockTarget|null=null;
  private guides:DockGuide[]=[];
  reset(){this.target=null;this.guides=[];}
  step(point:DockPointer,scene:DockScene):DockFeedback {
    if(point.free){this.reset();return empty();}
    const target=dockTargetAt(scene,point);
    if(!contains(scene.bounds,point)&&!target){this.reset();return empty();}
    // Retain a compass while entering its arrows, even if an arrow extends over
    // a neighbour. Re-measure it so a removed/resized target cannot leave stale geometry.
    const previous=this.target,current=previous&&(previous.floating?scene.floating.find(item=>item.id===previous.id)?.rect:!scene.locked?measureDockTree(removeDockPanel(scene.tree,scene.panel),scene.bounds).panels[previous.id]:undefined);
    this.target=current&&this.guides.some(guide=>contains(guide.button,point))?{...previous!,rect:current}:target;
    this.guides=createDockGuides(scene,this.target);
    const ready=this.guides.find(guide=>contains(guide.button,point))||null;
    return {visible:this.guides.length>0,target:this.target,guides:this.guides,ready};
  }
}
