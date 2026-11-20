import type {PointerEvent as ReactPointerEvent} from 'react';
import type {DragControl} from './PanelControl';
import {dockedPanels,removeDockPanel,activateDockPanel,type DockTree,type Rect} from './panelLayout';
import {NativeHostRegistry,type NativeHost} from './nativeHostRegistry';
import {subscribeStylesheetChanges} from '../theme/stylesheetChanges';

export type NativeFloatOptions={content?:()=>DockTree|undefined;resizeSplit?:(split:string,ratio:number)=>void;rect?:()=>Rect;inactive?:boolean;onReady?:()=>void;onFailure?:()=>void;onConnect?:(stage:HTMLElement,child:Window)=>void;onReturn?:()=>void;tabDrag?:(id:string,event:ReactPointerEvent<HTMLElement>,control?:DragControl)=>void};
export type NativePanelHandle={mount:(parent:HTMLElement)=>void;home:()=>void;active:(value:boolean|null)=>void;title:()=>string;dirty:()=>boolean;focus:()=>void;isComposing:()=>boolean};
type Resource={child:Window;stage:HTMLElement|null;connected:boolean;select:(id:string)=>void;options:NativeFloatOptions;cleanup:()=>void};
export type LiveNativeHost=NativeHost<Resource>;

export function nativeHostContent(host:LiveNativeHost):DockTree|undefined {
  let content=host.resource.options.content?.();
  if(!content)return;
  for(const id of dockedPanels(content))if(!host.members.includes(id))content=removeDockPanel(content||null,id)??undefined;
  return activateDockPanel(content||null,host.active)??undefined;
}
function shownInTree(tree:DockTree):string[]{
  if(tree.type==='split')return [...shownInTree(tree.a),...shownInTree(tree.b)];
  return [tree.type==='panel'?tree.panel:tree.active];
}

/** Mirrors presentation only; panels retain their original React and editor owners. */
export function mirrorAppearance(target:Document){
  const copies=new Map<Element,{node:HTMLElement;signature:string}>();
  let frame=0,disposed=false,stylesDirty=false,rootDirty=false;
  const styles=()=>{
    const sources=Array.from(document.head.querySelectorAll('style,link[rel="stylesheet"]'));
    const live=new Set(sources);
    for(const [source,copy] of copies)if(!live.has(source)){copy.node.remove();copies.delete(source);}
    let previous:HTMLElement|null=null;
    for(const source of sources){
      let css=source.textContent||'';
      if(source.tagName==='STYLE')try{css=Array.from((source as HTMLStyleElement).sheet?.cssRules||[],rule=>rule.cssText).join('\n')||css;}catch{/* Keep unavailable stylesheet text. */}
      const signature=JSON.stringify([Array.from(source.attributes,attribute=>[attribute.name,attribute.value]),css]);
      let copy=copies.get(source);
      if(!copy||copy.signature!==signature){
        const node=source.cloneNode(true) as HTMLElement;
        if(source.tagName==='STYLE')node.textContent=css;
        node.dataset.hiveMirror='';
        if(copy){copy.node.replaceWith(node);}else target.head.appendChild(node);
        copy={node,signature};copies.set(source,copy);
      }
      // Preserve cascade order without touching unchanged nodes in the usual case.
      if(previous&&previous.nextSibling!==copy.node)target.head.insertBefore(copy.node,previous.nextSibling);
      previous=copy.node;
    }
  };
  const root=()=>{const source=document.documentElement,dest=target.documentElement;
    if(dest.className!==source.className)dest.className=source.className;
    if(dest.style.cssText!==source.style.cssText)dest.style.cssText=source.style.cssText;
    const lang=source.lang||'zh-CN';if(dest.lang!==lang)dest.lang=lang;
  };
  const render=()=>{frame=0;if(disposed)return;if(stylesDirty){stylesDirty=false;styles();}if(rootDirty){rootDirty=false;root();}};
  const schedule=()=>{if(!disposed&&!frame)frame=window.requestAnimationFrame(render);};
  const scheduleStyles=()=>{stylesDirty=true;schedule();},scheduleRoot=()=>{rootDirty=true;schedule();};
  const styleObserver=new MutationObserver(scheduleStyles),rootObserver=new MutationObserver(scheduleRoot);
  let unsubscribeStyles=()=>{};
  try{
    styles();root();
    styleObserver.observe(document.head,{childList:true,subtree:true,characterData:true,attributes:true});
    rootObserver.observe(document.documentElement,{attributes:true,attributeFilter:['class','style','lang']});
    document.head.addEventListener('load',scheduleStyles,true);
    unsubscribeStyles=subscribeStylesheetChanges(sheet=>{if(sheet.ownerNode?.ownerDocument===document)scheduleStyles();});
  }catch(error){styleObserver.disconnect();rootObserver.disconnect();for(const copy of copies.values())copy.node.remove();throw error;}
  return()=>{disposed=true;unsubscribeStyles();styleObserver.disconnect();rootObserver.disconnect();document.head.removeEventListener('load',scheduleStyles,true);if(frame)window.cancelAnimationFrame(frame);for(const copy of copies.values())copy.node.remove();copies.clear();};
}

/** Native hosts, rather than any member panel, own windows, timers and listeners. */
export class NativeHostRuntime {
  readonly registry=new NativeHostRegistry<Resource>();
  readonly handles=new Map<string,NativePanelHandle>();
  readonly lastRects=new Map<string,Rect>();
  constructor(private changed:()=>void,private report:(message:string)=>void){}
  windows(){return new Map(this.registry.values().filter(host=>host.resource.connected&&!host.resource.child.closed).flatMap(host=>host.members.map(id=>[id,host.resource.child] as const)));}
  rect(id:string){
    const host=this.registry.get(id);if(!host||host.resource.child.closed)return null;
    // The main process owns screen/content/zoom conversion, including grouped hosts.
    return window.hiveDesktop?.panelRect?.(host.id)||null;
  }
  composing(ids:string[]){return ids.some(id=>this.handles.get(id)?.isComposing());}
  refresh(id:string){const host=this.registry.get(id);if(host?.resource.connected&&!host.resource.child.closed){host.resource.child.document.title=`${this.handles.get(host.active)?.title()||'面板'} — HIVE markdown editor`;if(host.group)this.changed();}}
  select(id:string,member:string){const host=this.registry.get(id);if(!host||!this.registry.select(host.id,member))return;this.activate(host);host.resource.select(member);this.changed();}
  syncVisibility(host:LiveNativeHost){const content=nativeHostContent(host),shown=content?shownInTree(content):[host.active];for(const id of host.members)this.handles.get(id)?.active(host.group?shown.includes(id):null);}
  private activate(host:LiveNativeHost){this.syncVisibility(host);this.refresh(host.id);}
  close(id:string,force=false){
    const host=this.registry.get(id);if(!host)return true;
    return this.returnMembers([...host.members],force);
  }
  removeMember(id:string,force=false){
    return this.returnMembers([id],force);
  }
  /** Plan all affected hosts before moving any container. Keep registration intact
   * until every move succeeds, so a partial DOM failure can return moved members
   * to their original stage without closing the source windows. */
  returnMembers(ids:readonly string[],force=false){
    const selected=new Set(ids),hosts=this.registry.values().filter(host=>host.members.some(id=>selected.has(id)));
    if(!hosts.length)return true;
    if(!force&&hosts.some(host=>this.composing(host.members))){this.report('请先完成当前输入法组词，再移回或关闭窗口。');return false;}
    const moved:{id:string;host:LiveNativeHost}[]=[],rects=new Map(hosts.map(host=>[host.id,this.rect(host.id)]));
    try{
      for(const host of hosts)for(const id of host.members)if(selected.has(id)){moved.push({id,host});this.handles.get(id)?.home();}
    }catch{
      for(const {id,host} of moved.reverse()){
        try{if(!host.resource.child.closed&&host.resource.stage)this.handles.get(id)?.mount(host.resource.stage);}catch{/* Keep the source registered and reachable for retry. */}
      }
      this.report('面板移回未完成，请重试。');return false;
    }
    for(const host of hosts){
      for(const id of [...host.members])if(selected.has(id)){
        const rect=rects.get(host.id);if(rect)this.lastRects.set(id,rect);
        this.registry.removeMember(id);this.handles.get(id)?.active(null);
      }
      if(this.registry.get(host.id)===host)this.activate(host);
      else{
        try{host.resource.cleanup();}catch{this.report('窗口资源清理未完全完成，请重试。');}
        try{host.resource.options.onReturn?.();}catch{this.report('窗口回接通知失败，面板已保留。');}
        if(!host.resource.child.closed)window.hiveDesktop?.closePanel(host.id);
      }
    }
    this.changed();if(!force)window.focus();return true;
  }
  extract(id:string){
    const source=this.registry.get(id);if(!source||source.resource.child.closed||!source.resource.stage||source.members.length<2||this.composing(source.members))return null;
    const transfer=this.registry.extract(id)!;this.handles.get(id)?.active(false);this.activate(source);this.changed();
    return {restore:()=>{
      const current=this.registry.get(id);if(current&&current.id!==source.id&&!this.close(current.id,true))return false;
      if(source.resource.child.closed){this.close(source.id,true);return false;}
      if(!transfer.restore())return false;
      try{this.handles.get(id)?.mount(source.resource.stage!);}
      catch{
        this.registry.extract(id);
        try{this.handles.get(id)?.home();}catch{this.report('面板显示恢复未完成，请从面板管理重试。');}
        this.activate(source);this.changed();this.report('标签回接失败，已保留主窗口恢复入口。');return false;
      }
      this.activate(source);this.changed();return true;
    }};
  }
  open(id:string,options:NativeFloatOptions={},members=[id],select:(id:string)=>void=()=>{}){
    const previous=this.registry.get(id);
    if(previous&&!previous.resource.child.closed){
      // The workspace already requested this member. Select it in the live host
      // without calling the tab-click callback that opens the workspace again.
      if(previous.active!==id&&this.registry.select(previous.id,id))this.activate(previous);
      window.hiveDesktop?.windowCommand('focus',previous.id);
      return;
    }
    if(previous)this.close(previous.id,true);
    if(!window.hiveDesktop?.isDesktop||new Set(members).size!==members.length||!members.includes(id)||members.some(member=>!this.handles.has(member)||!!this.registry.get(member))||this.composing(members)){options.onFailure?.();return;}
    const group=members.length>1,hostId=group?`native-group:${crypto.randomUUID()}`:id;
    const url=new URL('/',window.location.href);url.searchParams.set('panelWindow',hostId);
    const toolbar=id==='global-toolbar';let child:Window|null;
    try{
      const desired=options.rect?.(),width=toolbar?352:Math.max(220,Math.round(desired?.width||380)),height=toolbar?104:Math.max(140,Math.round(desired?.height||520));
      child=window.open(url.href,`hive-host-${hostId}-${crypto.randomUUID()}`,`popup,width=${width},height=${height}`);
    }catch{this.report('无法打开独立窗口，请重试。');options.onFailure?.();return;}
    if(!child){this.report('无法打开独立窗口，请重试。');options.onFailure?.();return;}
    const resource:Resource={child,stage:null,connected:false,select,options,cleanup:()=>{}};
    const host=this.registry.create(hostId,members,id,resource,group);let unmirror:(()=>void)|undefined,failureReported=false;
    const fail=(message?:string)=>{if(failureReported||this.registry.get(hostId)!==host)return;failureReported=true;this.close(hostId,true);if(message)this.report(message);options.onFailure?.();};
    const restore=()=>{if(this.registry.get(hostId)!==host)return;if(!resource.connected)fail('独立窗口在连接完成前关闭，面板已保留。');else this.close(hostId,true);};
    const connect=()=>{
      if(resource.connected||child.closed||this.registry.get(hostId)!==host)return;
      try{
        if(child.location.href!==url.href)return;
        const shell=child.document.createElement('div'),stage=child.document.createElement('div');shell.className='app-shell desktop-panel-shell';stage.className='workbench free-workbench desktop-panel-workbench';shell.appendChild(stage);
        child.document.body.className=toolbar?'desktop-panel-window desktop-toolbar-window':'desktop-panel-window';child.document.body.replaceChildren(shell);resource.stage=stage;unmirror=mirrorAppearance(child.document);
        for(const member of host.members)this.handles.get(member)!.mount(stage);
        const mounted=new Set([...stage.querySelectorAll<HTMLElement>('[data-panel-id]')].map(element=>element.dataset.panelId));
        if(host.members.some(member=>!mounted.has(member)))throw new Error('面板内容尚未准备好');
        resource.connected=true;this.activate(host);options.onConnect?.(stage,child);
        if(this.registry.get(hostId)!==host)return;
        child.addEventListener('unload',restore);this.changed();
        if(this.registry.get(hostId)!==host)return;
        if(window.hiveDesktop!.panelReady(hostId,options.rect?.(),options.inactive)===false){
          console.warn('HIVE native host initialization rejected:',{hostId,reason:'main-rejected'});
          fail('浮窗未能完成初始化，面板已返回主窗口');return;
        }
        clearTimeout(timeout);options.onReady?.();
      }catch(error){console.warn('HIVE native host connection failed:',{hostId,reason:'renderer-connection-error',message:(error as Error).message});fail('浮窗未能完成初始化，面板已返回主窗口');}
    };
    const timeout=window.setTimeout(()=>fail('独立窗口连接超时，面板已留在主窗口。'),15000),watch=window.setInterval(()=>{if(child.closed)restore();},500);
    resource.cleanup=()=>{clearTimeout(timeout);clearInterval(watch);unmirror?.();child.removeEventListener('load',connect);child.removeEventListener('unload',restore);};
    child.addEventListener('load',connect);connect();
  }
}
