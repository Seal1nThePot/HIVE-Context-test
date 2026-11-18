import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import http from 'node:http';

const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
const output=path.resolve(process.env.HIVE_VERIFY_OUTPUT||path.join(root,'delivery/window-geometry-20261118'));
const packageIndex=process.argv.indexOf('--package'),packageOutput=packageIndex<0?null:path.resolve(process.argv[packageIndex+1]);
const runtimeRoot=packageOutput?path.join(packageOutput,'win-unpacked/resources/app.asar'):root;
const reportPrefix=packageOutput?'package-':'';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fixture=`import React,{useRef} from 'react';import {createRoot} from 'react-dom/client';
import {DesktopPanelsProvider,DesktopPanel,useDesktopPanels} from './src/features/workspace/DesktopPanels';
import {usePanelWorkspace} from './src/features/workspace/usePanelWorkspace';
import {defaultWorkspace,placeWorkspacePanel} from './src/features/workspace/workspaceState';
import PanelIconRail from './src/features/workspace/PanelIconRail';import {MessageSquare} from 'lucide-react';
function Fixture(){const stage=useRef(null),w=usePanelWorkspace(stage),d=useDesktopPanels();window.testWorkspace=w;window.testDesktop=d;
window.testGroup=()=>{const base=defaultWorkspace();w.restoreLayout(placeWorkspacePanel(base,'scratch','conversation','center',{x:550,y:120,width:360,height:420}));};
return <main className="nearby-workbench-middle" style={{position:'fixed',left:0,top:80,width:'100%',bottom:20}}>
<div className="rail-edge-wrap"><PanelIconRail edge="left" scale={1} items={w.autoHideItems.filter(i=>i.edge==='left').map(i=>({...i,label:i.id,Icon:MessageSquare}))} onToggle={w.toggleAutoHide} onMove={w.repositionAutoHide}/></div>
<div ref={stage} className="workbench free-workbench" style={{position:'relative',flex:1,minWidth:0,height:'100%'}}>{['editor','files','conversation','scratch'].map(id=>{const p=w.panel(id);return <DesktopPanel key={id} id={id} title={id} open={w.isOpen(id)} visible={p.visible}><aside ref={p.ref} data-panel-id={id} className="workspace-panel" style={p.style}><div className="panel-drag-header" data-lock-panel={id}>{id}</div></aside></DesktopPanel>})}</div>
<div className="rail-edge-wrap"><PanelIconRail edge="right" scale={1} items={w.autoHideItems.filter(i=>i.edge==='right').map(i=>({...i,label:i.id,Icon:MessageSquare}))} onToggle={w.toggleAutoHide} onMove={w.repositionAutoHide}/></div></main>}
if(!new URLSearchParams(location.search).has('panelWindow')){document.documentElement.style.setProperty('--ui-scale','1');document.documentElement.style.setProperty('--text-scale','1');createRoot(document.getElementById('root')).render(<DesktopPanelsProvider><Fixture/></DesktopPanelsProvider>);}`;

async function worker(temporary){
  const {app,BrowserWindow,ipcMain,screen}=require('electron');
  app.setPath('userData',path.join(temporary,'profile'));app.disableHardwareAcceleration();
  app.on('window-all-closed',()=>{});
  const ready=app.whenReady();await ready;
  const {createPanelGeometry,createPanelRectHandler}=require(path.join(runtimeRoot,'desktop/panelGeometry.cjs'));
  const {createPanelReadyHandler}=require(path.join(runtimeRoot,'desktop/panelReady.cjs'));
  let main,server;const children=new Map(),readyIds=new Set(),sizeTargets=new WeakMap();
  const geometry=createPanelGeometry({mainWindow:()=>main});
  const isMain=event=>event.sender===main?.webContents;
  ipcMain.on('hive:preferences-read',event=>{event.returnValue=null;});
  ipcMain.on('hive:panel-ready',createPanelReadyHandler({isMainOrigin:isMain,panelWindows:children,geometry,readyPanelIds:readyIds,sizeTargets}));
  ipcMain.on('hive:panel-rect',createPanelRectHandler({isMainSender:isMain,panelWindows:children,geometry}));
  ipcMain.on('hive:panel-close',(event,id)=>{if(isMain(event))children.get(id)?.destroy();});
  ipcMain.on('hive:dock-overlay',()=>{});
  try{
    const css=path.join(runtimeRoot,'dist/assets',(await fs.readdir(path.join(runtimeRoot,'dist/assets'))).find(name=>name.endsWith('.css')));
    server=http.createServer(async(req,res)=>{
      const name=new URL(req.url,'http://localhost').pathname;
      const routes={'/':path.join(temporary,'fixture.html'),'/fixture.js':path.join(temporary,'fixture.js'),'/fixture.css':path.join(temporary,'fixture.css'),'/product.css':css};
      try{if(!routes[name]){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(routes[name]));}catch{res.writeHead(500).end();}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin='http://127.0.0.1:'+server.address().port,scenarios=[];
    const displays=screen.getAllDisplays();
    const near=(actual,expected,tolerance=0)=>{for(const key of ['x','y','width','height'])assert.ok(Math.abs(actual[key]-expected[key])<=tolerance,`${key}: ${actual[key]} != ${expected[key]}`);};
    for(const display of displays){
      for(const zoom of [1,1.25,1.5]){
        main=new BrowserWindow({show:false,focusable:false,skipTaskbar:true,x:display.workArea.x+80,y:display.workArea.y+60,width:1000,height:760,frame:false,thickFrame:true,webPreferences:{preload:path.join(runtimeRoot,'desktop/preload.cjs'),backgroundThrottling:false}});
        main.webContents.setWindowOpenHandler(()=>({action:'allow',overrideBrowserWindowOptions:{show:false,focusable:false,skipTaskbar:true,width:380,height:520,minWidth:220,minHeight:140,frame:false,thickFrame:true,webPreferences:{preload:path.join(runtimeRoot,'desktop/preload.cjs'),backgroundThrottling:false}}}));
        main.webContents.on('did-create-window',(child,{url})=>{
          const id=new URL(url).searchParams.get('panelWindow');children.set(id,child);
          // Run the production ready handler without showing or focusing test windows.
          child.show=()=>{};child.showInactive=()=>{};
          child.once('closed',()=>{if(children.get(id)===child)children.delete(id);readyIds.delete(id);});
        });
        main.webContents.on('console-message',event=>{if(event.level==='error')console.error(event.message);});
        await main.loadURL(origin);main.webContents.setZoomFactor(zoom);await sleep(120);
        const js=code=>main.webContents.executeJavaScript(code);
        const until=async code=>{for(let i=0;i<200;i++){if(await js(code))return;await sleep(10);}throw Error('Timed out: '+code);};
        const tap=()=>js(`document.querySelector('.nearby-panel-rail button[aria-label$="conversation"]').click()`);
        const open=async()=>{await tap();await until('window.testDesktop.windows.has("conversation")');assert.ok(readyIds.has('conversation'));await sleep(10);};
        const collapse=async()=>{await tap();await until('!window.testDesktop.windows.has("conversation")');await sleep(10);};
        const read=()=>js('window.testDesktop.rect("conversation")');
        await until('!!window.testWorkspace&&!!window.testDesktop');
        await js('window.testWorkspace.floatNativePanel("conversation")');await until('window.testDesktop.windows.has("conversation")');await js('window.testWorkspace.minimize("conversation")');await sleep(40);
        const cycles=[];let saved,actual;
        for(let cycle=0;cycle<30;cycle++){
          await open();const rect=await read(),content=children.get('conversation').getContentBounds();
          if(cycle===0){saved=rect;actual=content;}else{near(rect,saved);near(content,actual,2);}
          await collapse();const stored=await js('window.testWorkspace.capture().autoHide.conversation.rect');near(stored,saved);
          cycles.push({cycle,rect,content,stored});
        }
        // Simulate real native geometry edits, then let the normal collapse/read
        // path capture them. A query never re-applies the previous placement.
        await open();const child=children.get('conversation'),before=child.getContentBounds();
        child.setContentBounds({x:before.x+25,y:before.y+30,width:before.width+35,height:before.height+20});await sleep(30);
        const edited=await read();assert.ok(edited.width>saved.width);assert.ok(edited.x>saved.x);
        await collapse();for(let cycle=0;cycle<10;cycle++){await open();near(await read(),edited);await collapse();}
        // Re-evaluate the transform while a child remains at the same screen
        // rectangle, then ensure reopening does not apply that transform twice.
        await open();const unchangedScreen=children.get('conversation').getContentBounds(),mainBounds=main.getBounds();
        main.setPosition(mainBounds.x+35,mainBounds.y+20);main.webContents.setZoomFactor(zoom===1.5?1.25:1.5);await sleep(80);
        const transformed=await read();await collapse();await open();near(await read(),transformed);near(children.get('conversation').getContentBounds(),unchangedScreen,2);await collapse();
        // Repeated clicks while the native connection is still pending should
        // leave a single reachable host with the same saved geometry.
        await js(`for(let i=0;i<20;i++)document.querySelector('.nearby-panel-rail button[aria-label$="conversation"]').click()`);
        await until('window.testDesktop.windows.has("conversation")');await sleep(20);near(await read(),transformed);await collapse();
        // Verify a single shared native host reports the same canonical geometry
        // for every member; preserve the surviving member after one is shelved.
        await js('window.testGroup()');await sleep(30);await js('window.testWorkspace.groupFloat("conversation")');
        await until('window.testDesktop.windows.has("conversation")&&window.testDesktop.windows.has("scratch")');
        const group=await js('({a:window.testDesktop.rect("conversation"),b:window.testDesktop.rect("scratch"),owner:window.testDesktop.owner("conversation")})');near(group.a,group.b);assert.ok(group.owner.startsWith('native-group:'));
        await js('window.testWorkspace.minimize("scratch")');await until('!window.testDesktop.windows.has("scratch")');assert.equal(await js('window.testDesktop.windows.has("conversation")'),true);near(await read(),group.a);
        scenarios.push({displayId:display.id,scaleFactor:display.scaleFactor,zoom,cycles,edited,editedReopens:10,mainMoveAndZoom:{screen:unchangedScreen,transformed},rapidClicks:20,group});
        console.log(JSON.stringify({displayScale:display.scaleFactor,zoom,cycles:30,editedReopens:10,mainMoveAndZoom:true,rapidClicks:20,group:true,passed:true}));
        for(const child of children.values())child.destroy();children.clear();main.destroy();main=null;
      }
    }
    const result={checkedAt:new Date().toISOString(),runtimeRoot,method:'Hidden nonfocusable native Electron windows; real preload, production geometry/ready handlers, React workspace, rail and native hosts. Only show/showInactive suppressed. No desktop input.',passed:true,scenarios};
    await fs.writeFile(path.join(output,reportPrefix+'render-validation.json'),JSON.stringify(result,null,2));
    server.close();app.exit(0);
  }catch(error){console.error(error.stack);for(const child of children.values())child.destroy();main?.destroy();server?.close();app.exit(1);}
}

if(process.argv.includes('--geometry-worker'))void worker(process.argv.at(-1));
else{
  await fs.mkdir(output,{recursive:true});const temporary=await fs.mkdtemp(path.join(output,'.geometry-'));
  try{
    const {build}=await import('esbuild');await build({stdin:{contents:fixture,resolveDir:root,sourcefile:'geometry-fixture.tsx',loader:'tsx'},bundle:true,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},jsx:'automatic',outfile:path.join(temporary,'fixture.js'),logLevel:'error'});
    await fs.writeFile(path.join(temporary,'fixture.html'),'<!doctype html><html><meta charset="utf-8"><link rel="stylesheet" href="/product.css"><link rel="stylesheet" href="/fixture.css"><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
    const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
    const child=spawn((await import('electron')).default,[fileURLToPath(import.meta.url),...(packageOutput?['--package',packageOutput]:[]),'--geometry-worker',temporary],{cwd:root,windowsHide:true,env:environment,stdio:['ignore','pipe','pipe']});let log='';
    child.stdout.on('data',chunk=>{log+=chunk;process.stdout.write(chunk);});child.stderr.on('data',chunk=>{log+=chunk;process.stderr.write(chunk);});
    const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Geometry verification timeout'));},180000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);resolve(code);});});
    await fs.writeFile(path.join(output,reportPrefix+'render.log'),log);assert.equal(code,0,'Hidden Electron geometry verification failed');
  }finally{
    const resolved=path.resolve(temporary);assert.equal(path.dirname(resolved),path.resolve(output));assert.ok(path.basename(resolved).startsWith('.geometry-'));await fs.rm(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
}
