import {describe,it,expect,vi} from 'vitest';
import {createPanelReadyHandler} from './panelReady.cjs';
import {createPanelGeometry} from './panelGeometry.cjs';

function fixture({authorized=true,registered=true,throwOnShow=false,canPresent}={}){
  const id='native-group:test',replies=[];
  // Electron consumes its sync reply callback on the first setter invocation.
  let firstReply;const event={};Object.defineProperty(event,'returnValue',{set(value){replies.push(value);if(replies.length===1)firstReply=value;}});
  const child={setContentBounds:vi.fn(),getContentBounds:()=>({x:0,y:0,width:400,height:300}),showInactive:vi.fn(),show:vi.fn(()=>{if(throwOnShow)throw new Error('show failed');}),getBounds:()=>({x:0,y:0,width:400,height:300})};
  const readyPanelIds=new Set(),sizeTargets=new WeakMap(),onRejected=vi.fn(),onAccepted=vi.fn();
  const geometry=createPanelGeometry({mainWindow:()=>({getContentBounds:()=>({x:100,y:80,width:1200,height:800}),webContents:{getZoomFactor:()=>1}})});
  const handler=createPanelReadyHandler({isMainOrigin:()=>authorized,panelWindows:new Map(registered?[[id,child]]:[]),geometry,readyPanelIds,sizeTargets,canPresent,onRejected,onAccepted});
  return {id,event,replies,reply:()=>firstReply,child,handler,readyPanelIds,sizeTargets,onRejected,onAccepted};
}
describe('panel-ready single synchronous reply',()=>{
  it('replies true once after a registered host is initialized',()=>{
    const f=fixture();f.handler(f.event,f.id,{x:-400,y:200,width:500,height:350},true);
    expect(f.reply()).toBe(true);expect(f.replies).toEqual([true]);expect(f.child.setContentBounds).toHaveBeenCalledWith({x:-300,y:280,width:500,height:350});
    expect(f.child.showInactive).toHaveBeenCalledOnce();expect(f.readyPanelIds.has(f.id)).toBe(true);expect(f.onRejected).not.toHaveBeenCalled();
  });
  it('acknowledges readiness for a host that must wait for the themed first frame',()=>{
    const f=fixture({canPresent:()=>false});
    f.handler(f.event,f.id);
    expect(f.replies).toEqual([true]);
    expect(f.readyPanelIds.has(f.id)).toBe(true);
    expect(f.child.show).not.toHaveBeenCalled();
    expect(f.child.showInactive).not.toHaveBeenCalled();
  });
  it.each([
    [{authorized:false},'origin-rejected',undefined],
    [{registered:false},'host-not-registered',undefined],
    [{},'bounds-invalid',{x:0,y:0,width:0,height:300}],
    [{},'bounds-invalid',{x:Infinity,y:0,width:400,height:300}],
  ])('replies false once and records the rejection reason', (options,reason,placement)=>{
    const f=fixture(options);f.handler(f.event,f.id,placement,false);
    expect(f.reply()).toBe(false);expect(f.replies).toEqual([false]);expect(f.onRejected).toHaveBeenCalledWith(expect.objectContaining({reason}));
    expect(f.child.show).not.toHaveBeenCalled();expect(f.child.showInactive).not.toHaveBeenCalled();expect(f.readyPanelIds.size).toBe(0);
  });
  it('rejects a non-string host id without initializing a window',()=>{
    const f=fixture();f.handler(f.event,null,undefined,false);expect(f.replies).toEqual([false]);expect(f.onRejected).toHaveBeenCalledWith(expect.objectContaining({reason:'host-id-invalid'}));
  });
  it('still replies false once after an initialization exception and rolls back new ready state',()=>{
    const f=fixture({throwOnShow:true});f.handler(f.event,f.id,undefined,false);
    expect(f.replies).toEqual([false]);expect(f.reply()).toBe(false);expect(f.readyPanelIds.has(f.id)).toBe(false);
    expect(f.onRejected).toHaveBeenCalledWith(expect.objectContaining({reason:'initialization-exception',error:'show failed'}));
  });
  it('does not let diagnostic failures suppress or reverse an accepted reply',()=>{
    const f=fixture();f.onAccepted.mockImplementation(()=>{throw new Error('logger failed');});f.handler(f.event,f.id,undefined,false);
    expect(f.replies).toEqual([true]);expect(f.reply()).toBe(true);
  });
});
