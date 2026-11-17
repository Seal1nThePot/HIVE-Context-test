import type {PanelGroup} from './panelLayout';
import type {NativePanelHome} from './nativePanelState';

export type PanelOperationKind = 'open' | 'float' | 'drag' | 'dock' | 'minimize' | 'close' | 'restore';
export type PanelOperationResult = 'running' | 'succeeded' | 'rejected' | 'cancelled' | 'failed';
export type PanelOperation = {readonly id:number; readonly kind:PanelOperationKind; readonly members:readonly string[]; result:PanelOperationResult};

/** Session recovery is not ownership. Only a live host or an in-flight request
 * may reserve presentation outside the main workspace. DOM/editor owners remain
 * in NativeHostRuntime; this controller coordinates requests and their results. */
export class PanelLifecycle {
  readonly homes = new Map<string,NativePanelHome>();
  readonly groups = new Map<string,PanelGroup>();
  readonly pendingOpen = new Map<string,PanelOperation>();
  readonly pendingGroups = new Map<string,PanelOperation>();
  readonly handoffs = new Set<string>();
  private current = new Map<string,PanelOperation>();
  private sequence = 0;
  revision = 0;

  begin(kind:PanelOperationKind,ids:readonly string[]):PanelOperation {
    const members=[...new Set(ids)];
    this.invalidate(members);
    const operation:PanelOperation={id:++this.sequence,kind,members,result:'running'};
    for(const id of members)this.current.set(id,operation);
    this.revision++;
    return operation;
  }
  members(operation:PanelOperation){return operation.members.filter(id=>this.current.get(id)===operation);}
  isCurrent(operation:PanelOperation){return operation.result==='running'&&this.members(operation).length>0;}
  finish(operation:PanelOperation,result:Exclude<PanelOperationResult,'running'>){
    if(!this.isCurrent(operation))return false;
    operation.result=result;
    this.revision++;
    for(const id of this.members(operation)){this.current.delete(id);this.pendingOpen.delete(id);this.handoffs.delete(id);}
    for(const [id,pending] of this.pendingGroups)if(pending===operation)this.pendingGroups.delete(id);
    return true;
  }
  invalidate(ids:readonly string[]){
    for(const id of ids){
      const operation=this.current.get(id);if(operation)this.revision++;this.current.delete(id);this.pendingOpen.delete(id);this.handoffs.delete(id);
      if(operation&&!this.members(operation).length){operation.result='cancelled';for(const [owner,pending] of this.pendingGroups)if(pending===operation)this.pendingGroups.delete(owner);}
    }
  }
  opening(id:string){const kind=this.current.get(id)?.kind;return kind==='open'||kind==='float'||kind==='drag';}
  queue(id:string){
    if(this.opening(id))return;
    const operation=this.begin('open',[id]);this.pendingOpen.set(id,operation);
  }
  queueGroup(group:PanelGroup){
    const operation=this.begin('open',group.panels);this.pendingGroups.set(group.id,operation);
  }
  /** Remove only the selected members; retain the rest of each shared host. */
  clear(ids:readonly string[],preserveHomes=false){
    this.invalidate(ids);
    const selected=new Set(ids);
    for(const id of ids){this.pendingOpen.delete(id);this.handoffs.delete(id);if(!preserveHomes)this.homes.delete(id);}
    for(const [owner,group] of this.groups){
      if(!group.panels.some(id=>selected.has(id)))continue;
      const panels=group.panels.filter(id=>!selected.has(id)),pending=this.pendingGroups.has(owner);
      if(panels.length>1)this.groups.set(owner,{...group,panels,active:panels.includes(group.active)?group.active:panels[0]});
      else{this.groups.delete(owner);this.pendingGroups.delete(owner);if(pending){this.invalidate(panels);for(const id of panels)this.queue(id);}}
    }
  }
  reset(){this.clear([...new Set([...this.current.keys(),...this.homes.keys(),...[...this.groups.values()].flatMap(group=>group.panels)])]);this.groups.clear();this.pendingGroups.clear();}

  /** Synchronous migration is preflighted by the runtime. A rejected migration
   * leaves requests and recovery intact; no layout is committed on failure. */
  transition(kind:PanelOperationKind,ids:readonly string[],allowed:()=>boolean,execute:()=>boolean,commit:()=>void):PanelOperationResult {
    if(!allowed())return 'rejected';
    if(!execute())return 'failed';
    this.clear(ids);
    const operation=this.begin(kind,ids);
    try{commit();this.finish(operation,'succeeded');return 'succeeded';}
    catch(error){this.finish(operation,'failed');throw error;}
  }
}
