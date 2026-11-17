import {describe,it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {tooltipData,tooltipBounds,createTooltipManager}=require('./tooltipManager.cjs');
const value={id:'global-toolbar',text:'标注工具 · 点击后选中文字',anchor:{x:10,y:30,width:38,height:38},width:220,height:30,background:'rgb(32, 41, 29)',color:'rgb(223, 223, 186)',border:'rgb(116, 127, 80)',fontSize:11};
describe('native toolbar tooltip',()=>{
  it('uses custom translucent shadows while retaining old callers and rejecting CSS injection',()=>{
    expect(tooltipData({...value,shadow:'#12345678'})?.shadow).toBe('#12345678');
    expect(tooltipData(value)?.shadow).toBe('#00000066');expect(tooltipData({...value,shadow:'url(file:///bad)'})).toBeNull();
  });
  it('accepts only bounded plain data and safe colors',()=>{
    expect(tooltipData(value)?.text).toBe(value.text);
    for(const update of [{id:'settings'},{text:'x'.repeat(161)},{background:'url(https://example.com)'},{fontSize:Infinity},{anchor:{x:NaN,y:0,width:1,height:1}}])expect(tooltipData({...value,...update})).toBeNull();
  });
  it('places above the actual toolbar and clamps or flips at work-area edges',()=>{
    const area={x:0,y:0,width:1000,height:800};
    expect(tooltipBounds(value,{x:300,y:600},1,area)).toEqual({x:211,y:580,width:236,height:46});
    expect(tooltipBounds(value,{x:0,y:0},1,area)).toEqual({x:0,y:72,width:236,height:46});
    expect(tooltipBounds(value,{x:900,y:600},1,area).x).toBe(764);
  });
  it('hides on null and never shows stale data after loading',()=>{
    const handlers={},webHandlers={};
    const webContents={on:(name,fn)=>{webHandlers[name]=fn;},setWindowOpenHandler:vi.fn(),setZoomFactor:vi.fn(),send:vi.fn()};
    const instance={webContents,on:(name,fn)=>{handlers[name]=fn;},setIgnoreMouseEvents:vi.fn(),setBounds:vi.fn(),showInactive:vi.fn(),hide:vi.fn(),loadFile:vi.fn().mockResolvedValue(),isDestroyed:()=>false};
    const BrowserWindow=vi.fn(function(){return instance;});
    const owner={isDestroyed:()=>false,isVisible:()=>true,getContentBounds:()=>({x:300,y:600,width:352,height:104}),webContents:{getZoomFactor:()=>1}};
    const manager=createTooltipManager({BrowserWindow,screen:{getDisplayMatching:()=>({workArea:{x:0,y:0,width:1000,height:800}})},root:'/',getToolbar:()=>owner});
    manager.show(value);expect(instance.setIgnoreMouseEvents).toHaveBeenCalledWith(true);manager.hide();webHandlers['did-finish-load']();expect(instance.showInactive).not.toHaveBeenCalled();
    manager.show(value);expect(instance.showInactive).toHaveBeenCalledOnce();manager.show(null);expect(instance.hide).toHaveBeenCalled();
  });
});
