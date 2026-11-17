import type {PointerEvent as ReactPointerEvent} from 'react';
import type {DragControl} from './PanelControl';
import type {Rect} from './panelLayout';
import {NativeHostRegistry,type NativeHost} from './nativeHostRegistry';

export type NativeFloatOptions={rect?:()=>Rect;inactive?:boolean;onReady?:()=>void;onFailure?:()=>void;onConnect?:(stage:HTMLElement,child:Window)=>void;onReturn?:()=>void;tabDrag?:(id:string,event:ReactPointerEvent<HTMLElement>,control?:DragControl)=>void};
export type NativePanelHandle={mount:(parent:HTMLElement)=>void;home:()=>void;active:(value:boolean|null)=>void;title:()=>string;dirty:()=>boolean;focus:()=>void;isComposing:()=>boolean};
type Resource={child:Window;stage:HTMLElement|null;connected:boolean;select:(id:string)=>void;options:NativeFloatOptions;cleanup:()=>void};
export type LiveNativeHost=NativeHost<Resource>;

/** Mirrors presentation only; panels retain their original React and editor owners. */
function mirrorAppearance(target:Document){
  const styles=()=>{target.head.querySelectorAll('[data-hive-mirror]').forEach(node=>node.remove());for(const source of document.head.querySelectorAll('style,link[rel="stylesheet"]')){
    const clone=source.cloneNode(true) as HTMLElement;
    if(source.tagName==='STYLE')try{clone.textContent=[...((source as HTMLStyleElement).sheet?.cssRules||[])].map(rule=>rule.cssText).join('\n')||source.textContent;}catch{/* Keep unavailable stylesheet text. */}
    clone.dataset.hiveMirror='';target.head.appendChild(clone);
  }};
  const root=()=>{target.documentElement.className=document.documentElement.className;target.documentElement.style.cssText=document.documentElement.style.cssText;target.documentElement.lang=document.documentElement.lang||'zh-CN';};
  styles();root();const styleObserver=new MutationObserver(styles),rootObserver=new MutationObserver(root);
  styleObserver.observe(document.head,{childList:true,subtree:true,characterData:true,attributes:true});rootObserver.observe(document.documentElement,{attributes:true,attributeFilter:['class','style','lang']});
  return()=>{styleObserver.disconnect();rootObserver.disconnect();};
}

/** Native hosts, rather than any member panel, own windows, timers and listeners. */
export class NativeHostRuntime {
  readonly registry=new NativeHostRegistry<Resource>();
  readonly handles=new Map<string,NativePanelHandle>();
  readonly lastRects=new Map<string,Rect>();
  constructor(private changed:()=>void,private report:(message:string)=>void){}
  windows(){return new Map(this.registry.values().filter(host=>host.resource.connected&&!host.resource.child.closed).flatMap(host=>host.members.map(id=>[id,host.resource.child] as const)));}
  rect(id:string){const child=this.registry.get(id)?.resource.child;return child&&!child.closed?{x:child.screenX-window.screenX,y:child.screenY-window.screenY,width:child.outerWidth,height:child.outerHeight}:null;}
  composing(ids:string[]){return ids.some(id=>this.handles.get(id)?.isComposing());}
  refresh(id:string){const host=this.registry.get(id);if(host?.resource.connected&&!host.resource.child.closed){host.resource.child.document.title=`${this.handles.get(host.active)?.title()||'面板'} — HIVE markdown editor`;if(host.group)this.changed();}}
  select(id:string,member:string){const host=this.registry.get(id);if(!host||!this.registry.select(host.id,member))return;this.activate(host);host.resource.select(member);this.changed();}
  private activate(host:LiveNativeHost){for(const id of host.members)this.handles.get(id)?.active(host.group?id===host.active:null);this.refresh(host.id);}
  close(id:string,force=false){
    const host=this.registry.get(id);if(!host)return true;
    if(!force&&this.composing(host.members)){this.report('请先完成当前输入法组词，再移回或关闭窗口。');return false;}
    const rect=this.rect(host.id);this.registry.remove(host.id);host.resource.cleanup();
    for(const member of host.members){if(rect)this.lastRects.set(member,rect);const handle=this.handles.get(member);handle?.active(null);handle?.home();}
    host.resource.options.onReturn?.();this.changed();if(!host.resource.child.closed)window.hiveDesktop?.closePanel(host.id);if(!force)window.focus();return true;
  }
  removeMember(id:string,force=false){
    const host=this.registry.get(id);if(!host)return true;if(host.members.length===1)return this.close(host.id,force);
    if(!force&&this.composing([id]))return false;
    const rect=this.rect(host.id);if(rect)this.lastRects.set(id,rect);this.registry.removeMember(id);this.handles.get(id)?.active(null);this.handles.get(id)?.home();this.activate(host);this.changed();return true;
  }
  extract(id:string){
    const source=this.registry.get(id);if(!source||source.resource.child.closed||!source.resource.stage||source.members.length<2||this.composing(source.members))return null;
    const transfer=this.registry.extract(id)!;this.handles.get(id)?.active(false);this.activate(source);this.changed();
    return {restore:()=>{
      const current=this.registry.get(id);if(current&&current.id!==source.id)this.close(current.id,true);
      if(source.resource.child.closed){this.close(source.id,true);return false;}
      if(!transfer.restore())return false;
      this.handles.get(id)?.mount(source.resource.stage!);this.activate(source);this.changed();return true;
    }};
  }
  open(id:string,options:NativeFloatOptions={},members=[id],select:(id:string)=>void=()=>{}){
    const previous=this.registry.get(id);if(previous&&!previous.resource.child.closed){window.hiveDesktop?.windowCommand('focus',previous.id);return;}if(previous)this.close(previous.id,true);
    if(!window.hiveDesktop?.isDesktop||new Set(members).size!==members.length||!members.includes(id)||members.some(member=>!this.handles.has(member)||!!this.registry.get(member))||this.composing(members)){options.onFailure?.();return;}
    const group=members.length>1,hostId=group?`native-group:${crypto.randomUUID()}`:id;
    const url=new URL('/',window.location.href);url.searchParams.set('panelWindow',hostId);
    const desired=options.rect?.(),toolbar=id==='global-toolbar',width=toolbar?352:Math.max(220,Math.round(desired?.width||380)),height=toolbar?104:Math.max(140,Math.round(desired?.height||520));
    const child=window.open(url.href,`hive-host-${hostId}-${crypto.randomUUID()}`,`popup,width=${width},height=${height}`);
    if(!child){this.report('无法打开独立窗口，请重试。');options.onFailure?.();return;}
    const resource:Resource={child,stage:null,connected:false,select,options,cleanup:()=>{}};
    const host=this.registry.create(hostId,members,id,resource,group);let unmirror:(()=>void)|undefined,failureReported=false;
    const fail=(message?:string)=>{if(failureReported)return;failureReported=true;this.close(hostId,true);if(message)this.report(message);options.onFailure?.();};
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
        resource.connected=true;this.activate(host);options.onConnect?.(stage,child);child.addEventListener('unload',restore);this.changed();
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
