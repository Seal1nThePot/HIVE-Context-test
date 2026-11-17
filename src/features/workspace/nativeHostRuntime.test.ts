import {afterEach,describe,it,expect,vi} from 'vitest';
import {NativeHostRuntime} from './nativeHostRuntime';
import {EditorState} from '@codemirror/state';
import {history,undoDepth} from '@codemirror/commands';
const fixture=()=>{
  const closePanel=vi.fn(),panelRect=vi.fn(()=>({x:100,y:80,width:600,height:400}));vi.stubGlobal('window',{screenX:100,screenY:80,focus:vi.fn(),hiveDesktop:{closePanel,panelRect}});
  const changed=vi.fn(),report=vi.fn(),runtime=new NativeHostRuntime(changed,report);
  const state=EditorState.create({doc:'original',extensions:[history()]}).update({changes:{from:8,insert:' dirty'}}).state;
  const views=new Map(['a','b','c'].map(id=>[id,{state,root:{name:'source'}}]));
  for(const id of views.keys())runtime.handles.set(id,{mount:vi.fn(parent=>{views.get(id)!.root=parent as unknown as {name:string};}),home:vi.fn(),active:vi.fn(),title:()=>id,dirty:()=>true,focus:vi.fn(),isComposing:()=>false});
  const resource=(name:string)=>({child:{closed:false,screenX:200,screenY:160,outerWidth:600,outerHeight:400,document:{title:name}} as unknown as Window,stage:{name} as unknown as HTMLElement,connected:true,select:vi.fn(),options:{},cleanup:vi.fn()});
  const source=resource('source');runtime.registry.create('native-group:independent',['a','b','c'],'a',source,true);
  return {runtime,source,resource,views,state,changed,report,closePanel,panelRect};
};
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

function connectionFixture(){
  vi.useFakeTimers();const f=fixture();f.runtime.registry.remove('native-group:independent');
  const root={className:'',style:{cssText:''},lang:'zh-CN'},head={querySelectorAll:()=>[],appendChild:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn()};
  vi.stubGlobal('document',{head,documentElement:root});vi.stubGlobal('MutationObserver',class{observe(){}disconnect(){}});
  const children:{child:Window;load:()=>void;unload:()=>void;connect:()=>void}[]=[],timeouts:(()=>void)[]=[];
  const open=vi.fn((url:string)=>{
    const listeners=new Map<string,()=>void>(),stage={appendChild:vi.fn(),querySelectorAll:()=>[{dataset:{panelId:'a'}}]};
    const child={closed:false,screenX:200,screenY:160,outerWidth:400,outerHeight:300,location:{href:'about:blank'},document:{title:'',head,documentElement:{...root,style:{cssText:''}},body:{className:'',replaceChildren:vi.fn()},createElement:()=>({...stage})},addEventListener:(name:string,callback:()=>void)=>listeners.set(name,callback),removeEventListener:(name:string)=>listeners.delete(name)} as unknown as Window;
    const entry={child,load:()=>listeners.get('load')?.(),unload:()=>listeners.get('unload')?.(),connect:()=>{Object.assign(child.location,{href:url});listeners.get('load')?.();}};children.push(entry);return child;
  });
  const panelReady=vi.fn(()=>true);
  Object.assign(window,{location:{href:'http://127.0.0.1:4321/'},open,setTimeout:(callback:()=>void,delay:number)=>{timeouts.push(callback);return setTimeout(callback,delay);},setInterval,hiveDesktop:{isDesktop:true,panelReady,closePanel:f.closePanel,windowCommand:vi.fn()}});
  return {...f,children,timeouts,open,panelReady};
}
describe('native host lifecycle without a browser',()=>{
  it('reads grouped host content geometry through the main bridge and saves it before return',()=>{
    const f=fixture(),rect={x:-320,y:140,width:480,height:360};f.panelRect.mockReturnValue(rect);
    expect(f.runtime.rect('b')).toEqual(rect);expect(f.panelRect).toHaveBeenLastCalledWith('native-group:independent');
    f.runtime.returnMembers(['a','b']);expect(f.runtime.lastRects.get('a')).toEqual(rect);expect(f.runtime.lastRects.get('b')).toEqual(rect);
    expect(f.runtime.rect('a')).toBeNull();
  });
  it('disconnects an observer that was installed before the second observer failed',()=>{
    const f=connectionFixture(),observers:{observing:boolean;disconnect:()=>void}[]=[],failure=vi.fn();
    vi.stubGlobal('MutationObserver',class{observing=false;constructor(){observers.push(this);}observe(){if(observers.indexOf(this)===1)throw new Error('injected document teardown');this.observing=true;}disconnect(){this.observing=false;}});
    const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
    try{f.runtime.open('a',{onFailure:failure});f.children[0].connect();expect(failure).toHaveBeenCalledOnce();expect(observers.some(observer=>observer.observing)).toBe(false);expect(vi.getTimerCount()).toBe(0);}finally{warn.mockRestore();}
  });
  it.each(['mount','ready IPC','document access'] as const)('cleans the host after an injected %s connection failure',fault=>{
    const f=connectionFixture(),failure=vi.fn(),warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
    try{
      f.runtime.open('a',{onFailure:failure});
      if(fault==='mount')vi.mocked(f.runtime.handles.get('a')!.mount).mockImplementationOnce(()=>{throw new Error('injected mount');});
      if(fault==='ready IPC')f.panelReady.mockImplementationOnce(()=>{throw new Error('injected IPC disconnect');});
      if(fault==='document access')Object.defineProperty(f.children[0].child,'document',{get:()=>{throw new Error('injected dead document');}});
      expect(()=>f.children[0].connect()).not.toThrow();expect(failure).toHaveBeenCalledOnce();expect(f.runtime.registry.values()).toEqual([]);expect(vi.getTimerCount()).toBe(0);expect(f.views.get('a')!.state).toBe(f.state);
    }finally{warn.mockRestore();}
  });
  it('compensates a failed mount during extraction cancellation',()=>{
    const f=fixture(),transfer=f.runtime.extract('a')!;f.runtime.registry.create('a',['a'],'a',f.resource('target'));
    vi.mocked(f.runtime.handles.get('a')!.mount).mockImplementationOnce(()=>{throw new Error('injected root migration failure');});
    expect(()=>transfer.restore()).not.toThrow();expect(f.runtime.registry.get('a')).toBeUndefined();expect(f.runtime.registry.get('b')?.members).toEqual(['b','c']);
    expect(f.runtime.handles.get('a')!.home).toHaveBeenCalled();expect(f.views.get('a')!.state).toBe(f.state);
  });
  it('still tears down a host when its return callback throws',()=>{
    const f=fixture();f.source.options={onReturn:()=>{throw new Error('injected callback failure');}};
    expect(()=>f.runtime.close('a')).not.toThrow();expect(f.runtime.registry.values()).toEqual([]);expect(f.closePanel).toHaveBeenCalledWith('native-group:independent');expect(f.changed).toHaveBeenCalled();
  });
  it('ignores a queued timeout from an earlier window with a reused panel identity',()=>{
    const f=connectionFixture(),oldFailure=vi.fn(),ready=vi.fn();f.runtime.open('a',{onFailure:oldFailure});
    const oldTimeout=f.timeouts[0];f.runtime.close('a',true);f.runtime.open('a',{onReady:ready});
    oldTimeout();f.children[0].connect();expect(f.runtime.registry.get('a')?.resource.child).toBe(f.children[1].child);expect(oldFailure).not.toHaveBeenCalled();
    f.children[1].connect();expect(ready).toHaveBeenCalledOnce();expect(f.panelReady).toHaveBeenCalledOnce();f.runtime.close('a',true);expect(vi.getTimerCount()).toBe(0);
  });
  it('returns a window that times out or closes before connection and clears all resources',()=>{
    const f=connectionFixture(),failure=vi.fn();f.runtime.open('a',{onFailure:failure});vi.advanceTimersByTime(15000);
    expect(failure).toHaveBeenCalledOnce();expect(f.runtime.registry.values()).toEqual([]);expect(vi.getTimerCount()).toBe(0);
    f.runtime.open('a',{onFailure:failure});Object.assign(f.children[1].child,{closed:true});vi.advanceTimersByTime(500);
    expect(failure).toHaveBeenCalledTimes(2);expect(f.runtime.registry.values()).toEqual([]);expect(vi.getTimerCount()).toBe(0);
  });
  it('does not initialize a host after a connection callback returns it synchronously',()=>{
    const f=connectionFixture(),ready=vi.fn();f.runtime.open('a',{onConnect:()=>{f.runtime.close('a',true);},onReady:ready});f.children[0].connect();
    expect(f.panelReady).not.toHaveBeenCalled();expect(ready).not.toHaveBeenCalled();expect(f.runtime.registry.values()).toEqual([]);expect(vi.getTimerCount()).toBe(0);
  });
  it('reports synchronous window creation errors without losing the original handle',()=>{
    const f=connectionFixture(),failure=vi.fn();f.open.mockImplementation(()=>{throw new Error('window creation refused');});
    expect(()=>f.runtime.open('a',{onFailure:failure})).not.toThrow();expect(failure).toHaveBeenCalledOnce();expect(f.runtime.registry.values()).toEqual([]);expect(f.runtime.handles.has('a')).toBe(true);
  });
  it('leaves no timers or hosts after 100 open/connect/return cycles',()=>{
    const f=connectionFixture(),original=f.runtime.handles.get('a');
    for(let i=0;i<100;i++){f.runtime.open('a');f.children[i].connect();expect(f.runtime.windows().has('a')).toBe(true);f.runtime.close('a',true);}
    expect(f.runtime.registry.values()).toEqual([]);expect(f.runtime.windows().size).toBe(0);expect(vi.getTimerCount()).toBe(0);expect(f.runtime.handles.get('a')).toBe(original);
  });
  it('returns only selected group members without closing their shared host',()=>{
    const {runtime,source,closePanel}=fixture();expect(runtime.returnMembers(['a','c'])).toBe(true);
    expect(runtime.registry.get('b')?.members).toEqual(['b']);expect(runtime.registry.get('a')).toBeUndefined();
    expect(source.cleanup).not.toHaveBeenCalled();expect(closePanel).not.toHaveBeenCalled();
  });
  it('preflights every host before moving the first member of a batch',()=>{
    const {runtime,resource}=fixture();runtime.registry.removeMember('c');runtime.registry.create('c',['c'],'c',resource('other'));
    runtime.handles.get('c')!.isComposing=()=>true;
    expect(runtime.returnMembers(['a','c'])).toBe(false);expect(runtime.handles.get('a')!.home).not.toHaveBeenCalled();
    expect(runtime.registry.get('a')?.members).toEqual(['a','b']);expect(runtime.registry.get('c')?.members).toEqual(['c']);
  });
  it('compensates moved containers when the second host fails to return',()=>{
    const {runtime,source,resource,closePanel}=fixture();runtime.registry.removeMember('c');const other=resource('other');runtime.registry.create('c',['c'],'c',other);
    vi.mocked(runtime.handles.get('c')!.home).mockImplementation(()=>{throw new Error('DOM move failed');});
    expect(runtime.returnMembers(['a','c'])).toBe(false);
    expect(runtime.handles.get('a')!.mount).toHaveBeenCalledWith(source.stage);expect(runtime.handles.get('c')!.mount).toHaveBeenCalledWith(other.stage);
    expect(runtime.registry.get('a')?.members).toEqual(['a','b']);expect(runtime.registry.get('c')?.members).toEqual(['c']);
    expect(source.cleanup).not.toHaveBeenCalled();expect(other.cleanup).not.toHaveBeenCalled();expect(closePanel).not.toHaveBeenCalled();
  });
  it('extracts the former owner and cancels by moving only its existing handle back',()=>{
    const {runtime,source,resource,views,state,closePanel}=fixture(),view=views.get('a')!;
    const token=runtime.extract('a')!,target=resource('target');runtime.registry.create('a',['a'],'a',target);
    expect(source.cleanup).not.toHaveBeenCalled();expect(runtime.registry.get('b')?.members).toEqual(['b','c']);
    expect(token.restore()).toBe(true);expect(target.cleanup).toHaveBeenCalledTimes(1);expect(closePanel).toHaveBeenCalledWith('a');
    expect(source.cleanup).not.toHaveBeenCalled();expect(runtime.registry.get('a')?.members).toEqual(['a','b','c']);
    expect(runtime.handles.get('a')!.mount).toHaveBeenCalledWith(source.stage);expect(views.get('a')).toBe(view);expect(view.state).toBe(state);
    expect(view.state.doc.toString()).toBe('original dirty');expect(undoDepth(view.state)).toBe(1);
  });
  it('returns the remaining group while a separately extracted tab stays independent',()=>{
    const {runtime,source,resource,closePanel}=fixture();runtime.extract('a');runtime.registry.create('a',['a'],'a',resource('target'));
    expect(runtime.close('c')).toBe(true);expect(source.cleanup).toHaveBeenCalledTimes(1);expect(closePanel).toHaveBeenCalledWith('native-group:independent');
    expect(runtime.registry.get('b')).toBeUndefined();expect(runtime.registry.get('c')).toBeUndefined();expect(runtime.registry.get('a')?.id).toBe('a');
  });
  it('does not mount into a closed source during a failed or cancelled connection',()=>{
    const {runtime,resource}=fixture();const token=runtime.extract('a')!;runtime.registry.create('a',['a'],'a',resource('target'));
    runtime.close('native-group:independent',true);expect(token.restore()).toBe(false);
    expect(runtime.handles.get('a')!.mount).not.toHaveBeenCalled();expect(runtime.registry.values()).toEqual([]);
  });
  it('detects a closed source before its polling cleanup has run',()=>{
    const {runtime,source,resource}=fixture(),token=runtime.extract('a')!;runtime.registry.create('a',['a'],'a',resource('target'));
    Object.assign(source.child,{closed:true});expect(token.restore()).toBe(false);
    expect(runtime.handles.get('a')!.mount).not.toHaveBeenCalled();expect(runtime.registry.values()).toEqual([]);expect(source.cleanup).toHaveBeenCalledTimes(1);
  });
  it('keeps ownership and listeners intact when a composing group rejects extraction or return',()=>{
    const {runtime,source,report}=fixture();runtime.handles.get('b')!.isComposing=()=>true;
    expect(runtime.extract('a')).toBeNull();expect(runtime.close('a')).toBe(false);expect(source.cleanup).not.toHaveBeenCalled();
    expect(runtime.registry.get('a')?.members).toEqual(['a','b','c']);expect(report).toHaveBeenCalled();
  });
  it('returns the panel and shows a friendly message when the actual ready call is rejected',()=>{
    const {runtime,report,closePanel,views,state}=fixture();runtime.registry.remove('native-group:independent');
    const root={className:'',style:{cssText:''},lang:'zh-CN'},head={querySelectorAll:()=>[],appendChild:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn()};
    vi.stubGlobal('document',{head,documentElement:root});
    vi.stubGlobal('MutationObserver',class{observe(){}disconnect(){}});
    const stage={appendChild:vi.fn(),querySelectorAll:()=>[{dataset:{panelId:'a'}}]},child={closed:false,screenX:200,screenY:160,outerWidth:400,outerHeight:300,location:{href:''},document:{title:'',head,documentElement:{...root,style:{cssText:''}},body:{className:'',replaceChildren:vi.fn()},createElement:()=>({...stage})},addEventListener:vi.fn(),removeEventListener:vi.fn()};
    Object.assign(window,{location:{href:'http://127.0.0.1:4321/'},open:(url:string)=>{child.location.href=url;return child;},setTimeout,setInterval,hiveDesktop:{isDesktop:true,panelReady:()=>false,closePanel}});
    const warn=vi.spyOn(console,'warn').mockImplementation(()=>{}),failed=vi.fn();
    try{
      runtime.open('a',{onFailure:failed});
      expect(report).toHaveBeenCalledWith('浮窗未能完成初始化，面板已返回主窗口');expect(failed).toHaveBeenCalledOnce();
      expect(runtime.handles.get('a')!.home).toHaveBeenCalledOnce();expect(runtime.registry.values()).toEqual([]);expect(closePanel).toHaveBeenCalledWith('a');
      expect(views.get('a')!.state).toBe(state);expect(warn).toHaveBeenCalledWith('HIVE native host initialization rejected:',expect.objectContaining({reason:'main-rejected'}));
    }finally{warn.mockRestore();}
  });
});
