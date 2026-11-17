import {describe,it,expect,vi} from 'vitest';
import {createPanelGeometry,createPanelRectHandler} from './panelGeometry.cjs';

function fixture(zoom=1){
  let origin={x:-1200,y:100,width:1000,height:800};
  const main={isDestroyed:()=>false,getContentBounds:()=>origin,webContents:{getZoomFactor:()=>zoom}};
  const geometry=createPanelGeometry({mainWindow:()=>main});
  function child(){
    let actual={x:0,y:0,width:400,height:300};
    return {isDestroyed:()=>false,getContentBounds:()=>({...actual}),
      // Inject asymmetric OS/DPI rounding into every newly created host.
      setContentBounds:vi.fn(rect=>{actual={x:rect.x+1,y:rect.y-1,width:rect.width+2,height:rect.height+1};}),
      adjust:delta=>{for(const [key,value] of Object.entries(delta))actual[key]+=value;}};
  }
  return {geometry,child,moveMain:delta=>{origin={...origin,...delta};},zoom:value=>{zoom=value;}};
}

describe('native content geometry round trips',()=>{
  it.each([1,1.25,1.5,2])('keeps repeated reopen geometry fixed at page zoom %s despite OS rounding',zoom=>{
    const f=fixture(zoom);let saved={x:-200,y:120,width:400,height:320};
    for(let cycle=0;cycle<100;cycle++){
      const child=f.child();expect(f.geometry.restore(child,saved)).toBe(true);
      saved=f.geometry.read(child);expect(saved).toEqual({x:-200,y:120,width:400,height:320});
      expect(f.geometry.read(child)).toEqual(saved);
    }
  });
  it('records genuine moves/resizes once and preserves them on subsequent reopens',()=>{
    const f=fixture(1.25),child=f.child(),original={x:100,y:80,width:400,height:320};
    f.geometry.restore(child,original);child.adjust({x:-75,y:50,width:125,height:100});
    const edited={x:40,y:120,width:500,height:400};expect(f.geometry.read(child)).toEqual(edited);
    expect(f.geometry.read(child)).toEqual(edited);
    const reopened=f.child();f.geometry.restore(reopened,edited);expect(f.geometry.read(reopened)).toEqual(edited);
  });
  it('uses the current main content origin and zoom after the main window moves or zooms',()=>{
    const f=fixture(1),child=f.child();f.geometry.restore(child,{x:100,y:80,width:400,height:320});
    f.moveMain({x:-1000,y:50});f.zoom(1.25);
    expect(f.geometry.read(child)).toEqual({x:-80,y:104,width:320,height:256});
    const reopened=f.child();f.geometry.restore(reopened,f.geometry.read(child));expect(f.geometry.read(reopened)).toEqual(f.geometry.read(child));
  });
  it('clamps once to native minimum size and rejects invalid placement without resizing',()=>{
    const f=fixture(),child=f.child();expect(f.geometry.restore(child,{x:0,y:0,width:80,height:60})).toBe(true);
    expect(f.geometry.read(child)).toEqual({x:0,y:0,width:220,height:140});
    child.setContentBounds.mockClear();expect(f.geometry.restore(child,{x:Infinity,y:0,width:200,height:200})).toBe(false);expect(child.setContentBounds).not.toHaveBeenCalled();
    child.getMinimumSize=()=>[450,260];f.geometry.restore(child,{x:0,y:0,width:300,height:200});expect(f.geometry.read(child)).toEqual({x:0,y:0,width:450,height:260});
  });
  it('allows only the main sender to query registered live hosts and replies once on failure',()=>{
    const f=fixture(),child=f.child();f.geometry.restore(child,{x:10,y:20,width:400,height:320});
    const windows=new Map([['native-group:tools',child]]);
    for(const [authorized,id,expected] of [[true,'native-group:tools',{x:10,y:20,width:400,height:320}],[false,'native-group:tools',null],[true,'unregistered',null],[true,'',null],[true,null,null]]){
      const replies=[],event={};Object.defineProperty(event,'returnValue',{set:value=>replies.push(value)});
      createPanelRectHandler({isMainSender:()=>authorized,panelWindows:windows,geometry:f.geometry})(event,id);expect(replies).toEqual([expected]);
    }
    child.getContentBounds=()=>{throw new Error('destroyed during read');};const event={};
    createPanelRectHandler({isMainSender:()=>true,panelWindows:windows,geometry:f.geometry})(event,'native-group:tools');expect(event.returnValue).toBeNull();
  });
});
