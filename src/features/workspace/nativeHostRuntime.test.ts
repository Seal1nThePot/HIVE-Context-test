import {afterEach,describe,it,expect,vi} from 'vitest';
import {NativeHostRuntime} from './nativeHostRuntime';
import {EditorState} from '@codemirror/state';
import {history,undoDepth} from '@codemirror/commands';
const fixture=()=>{
  const closePanel=vi.fn();vi.stubGlobal('window',{screenX:100,screenY:80,focus:vi.fn(),hiveDesktop:{closePanel}});
  const changed=vi.fn(),report=vi.fn(),runtime=new NativeHostRuntime(changed,report);
  const state=EditorState.create({doc:'original',extensions:[history()]}).update({changes:{from:8,insert:' dirty'}}).state;
  const views=new Map(['a','b','c'].map(id=>[id,{state,root:{name:'source'}}]));
  for(const id of views.keys())runtime.handles.set(id,{mount:vi.fn(parent=>{views.get(id)!.root=parent as unknown as {name:string};}),home:vi.fn(),active:vi.fn(),title:()=>id,dirty:()=>true,focus:vi.fn(),isComposing:()=>false});
  const resource=(name:string)=>({child:{closed:false,screenX:200,screenY:160,outerWidth:600,outerHeight:400,document:{title:name}} as unknown as Window,stage:{name} as unknown as HTMLElement,connected:true,select:vi.fn(),options:{},cleanup:vi.fn()});
  const source=resource('source');runtime.registry.create('native-group:independent',['a','b','c'],'a',source,true);
  return {runtime,source,resource,views,state,changed,report,closePanel};
};
afterEach(()=>vi.unstubAllGlobals());
describe('native host lifecycle without a browser',()=>{
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
    const root={className:'',style:{cssText:''},lang:'zh-CN'},head={querySelectorAll:()=>[],appendChild:vi.fn()};
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
