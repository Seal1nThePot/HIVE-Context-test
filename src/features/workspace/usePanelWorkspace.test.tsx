import {afterEach,describe,expect,it,vi} from 'vitest';
import type {DependencyList,EffectCallback} from 'react';
import {NativeHostRuntime,type NativeFloatOptions} from './nativeHostRuntime';
import {usePanelWorkspace} from './usePanelWorkspace';
import {defaultWorkspace,hideWorkspacePanel,type WorkspaceLayout} from './workspaceState';
import {dockedPanels,type Rect} from './panelLayout';

// Keep the real workspace hook and native-host lifecycle. Only React scheduling
// and browser surfaces are replaced, so this checks presentation after effects.
const hooks=vi.hoisted(()=>({
  slots:[] as unknown[],cursor:0,dirty:false,effects:[] as (()=>void)[],desktop:null as unknown,
}));
vi.mock('react',async importOriginal=>({
  ...await importOriginal<typeof import('react')>(),
  useState:(initial:unknown)=>{
    const index=hooks.cursor++;
    if(!(index in hooks.slots))hooks.slots[index]=typeof initial==='function'?initial():initial;
    return [hooks.slots[index],(value:unknown)=>{
      const next=typeof value==='function'?value(hooks.slots[index]):value;
      if(!Object.is(next,hooks.slots[index])){hooks.slots[index]=next;hooks.dirty=true;}
    }];
  },
  useRef:(initial:unknown)=>{
    const index=hooks.cursor++;return hooks.slots[index]??(hooks.slots[index]={current:initial});
  },
  useEffect:(create:EffectCallback,deps?:DependencyList)=>{
    const index=hooks.cursor++,previous=hooks.slots[index] as {deps?:DependencyList;cleanup?:()=>void}|undefined;
    if(previous&&deps&&previous.deps&&deps.length===previous.deps.length&&deps.every((value,i)=>Object.is(value,previous.deps![i])))return;
    const slot={deps,cleanup:undefined as (()=>void)|undefined};hooks.slots[index]=slot;
    hooks.effects.push(()=>{previous?.cleanup?.();slot.cleanup=create()||undefined;});
  },
}));
vi.mock('./DesktopPanels',()=>({useDesktopPanels:()=>hooks.desktop}));
vi.mock('./useNativePanelDocking',()=>({useNativePanelDocking:()=>{}}));
vi.mock('./DockGuides',()=>({default:()=>null}));

const rect:Rect={x:80,y:180,width:300,height:460};
function fixture(enabled=true){
  Object.assign(hooks,{slots:[],cursor:0,dirty:true,effects:[]});
  vi.stubGlobal('window',{innerWidth:1280,innerHeight:900,screenX:0,screenY:0,focus:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),hiveDesktop:{closePanel:vi.fn()}});
  vi.stubGlobal('document',{addEventListener:vi.fn(),removeEventListener:vi.fn()});
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  const runtime=new NativeHostRuntime(()=>{desktop.windows=runtime.windows();hooks.dirty=true;},vi.fn());
  for(const id of ['files','trash','conversation','outline','scratch'])runtime.handles.set(id,{mount:vi.fn(),home:vi.fn(),active:vi.fn(),title:()=>id,dirty:()=>true,focus:vi.fn(),isComposing:()=>false});
  let hostNumber=0;
  const connect=(id:string,members:string[],options:NativeFloatOptions={},group=false)=>{
    if(runtime.registry.get(id))return;
    const host=group?`native-group:test-${++hostNumber}`:id;
    runtime.registry.create(host,members,id,{child:{closed:false,screenX:rect.x,screenY:rect.y,outerWidth:rect.width,outerHeight:rect.height,document:{title:id}} as unknown as Window,stage:{} as HTMLElement,connected:true,select:vi.fn(),options,cleanup:vi.fn()},group);
    desktop.windows=runtime.windows();hooks.dirty=true;
  };
  const desktop={enabled,windows:runtime.windows(),hiddenWindows:new Set<string>(),
    rect:(id:string)=>runtime.rect(id),lastRect:(id:string)=>runtime.lastRects.get(id)||null,
    members:(id:string)=>runtime.registry.get(id)?.members,owner:(id:string)=>runtime.registry.owner(id),panelForHost:(id:string)=>runtime.registry.get(id)?.active||id,
    attach:vi.fn((id:string)=>runtime.close(id)),removeMember:vi.fn((id:string)=>runtime.removeMember(id)),
    detach:vi.fn((id:string,options?:NativeFloatOptions)=>connect(id,[id],options)),
    detachGroup:vi.fn((id:string,members:string[],_select:unknown,options?:NativeFloatOptions)=>connect(id,members,options,true)),
    isComposing:()=>runtime.composing([...runtime.handles.keys()]),
  };
  hooks.desktop=desktop;
  const stage={current:null};let workspace:ReturnType<typeof usePanelWorkspace>;
  const flush=()=>{
    for(let pass=0;pass<20;pass++){
      hooks.cursor=0;hooks.dirty=false;hooks.effects=[];workspace=usePanelWorkspace(stage);
      for(const effect of hooks.effects)effect();
      if(!hooks.dirty)return workspace;
    }
    throw new Error('workspace effects did not settle');
  };
  const act=(action:(value:ReturnType<typeof usePanelWorkspace>)=>void)=>{action(workspace);return flush();};
  flush();
  return {runtime,desktop,flush,act,get workspace(){return workspace;}};
}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('pulling native shelf panels back into the workspace',()=>{
  it('keeps ordinary minimized panels visible when their rail is pulled',()=>{
    const f=fixture();f.act(w=>w.minimize('files'));f.act(w=>w.dockAutoHideRail('left',280));
    expect(f.workspace.panel('files').visible).toBe(true);expect(f.workspace.autoHideItems).toEqual([]);
  });
  it('shows a panel after opening its icon, minimizing its native window, and pulling the rail',()=>{
    const f=fixture();f.act(w=>w.minimize('files'));f.act(w=>w.toggleAutoHide('files'));
    expect(f.desktop.windows.has('files')).toBe(true);
    f.act(w=>w.minimize('files'));expect(f.desktop.windows.has('files')).toBe(false);
    f.act(w=>w.dockAutoHideRail('left',280));
    expect(f.workspace.openIds).toContain('files');expect(dockedPanels(f.workspace.capture().tree)).toContain('files');
    expect(f.workspace.panel('files').visible).toBe(true);expect(f.workspace.autoHideItems).toEqual([]);
    expect(f.desktop.windows.has('files')).toBe(false);expect(f.desktop.detach).toHaveBeenCalledTimes(1);
  });
  it.each(['left','right'] as const)('returns an open native panel before docking the %s rail',edge=>{
    const f=fixture();f.act(w=>w.minimize('files'));f.act(w=>w.repositionAutoHide('files',.25,edge));f.act(w=>w.toggleAutoHide('files'));
    const handle=f.runtime.handles.get('files')!,homeCalls=vi.mocked(handle.home).mock.calls.length;
    f.act(w=>w.dockAutoHideRail(edge,280));
    expect(f.workspace.panel('files').visible).toBe(true);expect(f.desktop.windows.has('files')).toBe(false);
    expect(handle.home).toHaveBeenCalledTimes(homeCalls+1);expect(f.runtime.handles.get('files')).toBe(handle);
  });
  it('keeps both sidebar tabs reachable after multiple native windows have been shelved',()=>{
    const f=fixture();f.act(w=>w.open('trash'));f.act(w=>w.minimize('files'));f.act(w=>w.minimize('trash'));
    for(const id of ['files','trash']){f.act(w=>w.toggleAutoHide(id));f.act(w=>w.minimize(id));}
    f.act(w=>w.dockAutoHideRail('left',280));
    expect(f.workspace.tabGroups.find(group=>group.panels.includes('files'))?.panels).toEqual(['files','trash']);
    for(const id of ['files','trash']){f.act(w=>w.open(id));expect(f.workspace.panel(id).visible).toBe(true);}
    expect(f.desktop.windows.size).toBe(0);expect(f.workspace.autoHideItems).toEqual([]);expect(f.desktop.detach).toHaveBeenCalledTimes(2);
  });
  it('removes a pending native open when the rail is pulled before connection',()=>{
    const f=fixture();f.act(w=>w.minimize('files'));
    f.act(w=>{w.toggleAutoHide('files');w.dockAutoHideRail('left',280);});
    expect(f.workspace.panel('files').visible).toBe(true);expect(f.desktop.detach).not.toHaveBeenCalled();
  });
  it('extracts only the selected rail member and leaves the other native group member open',()=>{
    const f=fixture();let layout:WorkspaceLayout=defaultWorkspace();
    layout=hideWorkspacePanel(layout,'files',rect,true,{edge:'left',offset:.25,rect});
    layout=hideWorkspacePanel(layout,'conversation',rect,true,{edge:'right',offset:.25,rect});
    layout={...layout,open:[...layout.open,'files','conversation'],minimized:[],floatingGroups:[{type:'group',id:'tools',panels:['files','conversation'],active:'files'}]};
    f.act(w=>w.restoreLayout(layout));expect(f.desktop.windows.size).toBe(2);
    const source=f.runtime.registry.get('conversation')!;
    f.act(w=>w.dockAutoHideRail('left',280));
    expect(f.workspace.panel('files').visible).toBe(true);expect(f.desktop.windows.has('files')).toBe(false);
    expect(f.runtime.registry.get('conversation')).toBe(source);expect(source.members).toEqual(['conversation']);expect(source.resource.cleanup).not.toHaveBeenCalled();
    expect(f.workspace.autoHideItems.map(item=>item.id)).toEqual(['conversation']);
  });
  it.each(['composing','locked','invalid width','return rejected'] as const)('preserves the shelf when %s prevents the transition',reason=>{
    const f=fixture();f.act(w=>w.minimize('files'));f.act(w=>w.toggleAutoHide('files'));
    if(reason==='composing')f.runtime.handles.get('files')!.isComposing=()=>true;
    if(reason==='locked')f.act(w=>w.toggleLocked());
    if(reason==='return rejected')f.desktop.removeMember.mockReturnValue(false);
    const before=f.workspace.capture();f.act(w=>w.dockAutoHideRail('left',reason==='invalid width'?NaN:280));
    expect(f.workspace.capture()).toEqual(before);expect(f.desktop.windows.has('files')).toBe(true);
    expect(f.workspace.autoHideItems.map(item=>item.id)).toEqual(['files']);
  });
  it('preserves browser-only rail expansion',()=>{
    const f=fixture(false);f.act(w=>w.minimize('files'));f.act(w=>w.dockAutoHideRail('left',280));
    expect(f.workspace.panel('files').visible).toBe(true);expect(f.desktop.removeMember).not.toHaveBeenCalled();
  });
});
