import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const project=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
const output=path.resolve(process.env.HIVE_VERIFY_OUTPUT||path.join(project,'.runtime/file-window-feedback'));
const fixture=`import React,{useRef,useState} from 'react';import {createRoot} from 'react-dom/client';
import {DesktopPanelsProvider,DesktopPanel,useDesktopPanels} from './src/features/workspace/DesktopPanels';
import {usePanelWorkspace} from './src/features/workspace/usePanelWorkspace';
import {defaultWorkspace,placeWorkspacePanel} from './src/features/workspace/workspaceState';
import {WorkspaceProvider} from './src/features/files/WorkspaceContext';import FileExplorer from './src/features/files/FileExplorer';
import InputBasisPanel from './src/features/chat/InputBasisPanel';import PanelControl from './src/features/workspace/PanelControl';
import WorkspaceTabs from './src/features/workspace/WorkspaceTabs';import PanelIconRail from './src/features/workspace/PanelIconRail';import {FileText} from 'lucide-react';
import './src/app/styles.css';import './src/features/workspace/free-workspace.css';import './src/features/workspace/panel-chrome.css';
const entries=[{name:'one.md',path:'one.md',type:'file'},{name:'two.md',path:'two.md',type:'file'},{name:'folder',path:'folder',type:'folder',children:[]}];
const info={id:'fixture-space',root:'synthetic',autoSave:false,revision:0,repositories:[]};
function Fixture(){const stage=useRef(null),w=usePanelWorkspace(stage),d=useDesktopPanels(),[sources,setSources]=useState([]),[filter,setFilter]=useState(''),[collapsed,setCollapsed]=useState(new Set());
window.fixture={w,d,sources,resetSources:()=>setSources([]),group:()=>w.restoreLayout(placeWorkspacePanel(defaultWorkspace(),'basis','files','center',{x:0,y:0,width:350,height:500})),moves:window.fixture?.moves||[]};
const controls=id=>{const p=w.panel(id);return <PanelControl panelId={id} label={id} floating={p.floating} onToggleFloat={p.toggleFloat} onOpen={p.openDocked} onClose={p.close} onMinimize={p.minimize}/>};
return <WorkspaceProvider info={info} onChange={()=>{}}><div style={{display:'flex',height:'100vh'}}><PanelIconRail edge="left" items={w.autoHideItems.map(i=>({...i,label:i.id,Icon:FileText}))} scale={1} onToggle={w.toggleAutoHide}/><div ref={stage} className="workbench free-workbench" style={{position:'relative',flex:1}}>
{['files','editor','conversation','basis'].map(id=>{const p=w.panel(id);return <DesktopPanel key={id} id={id} title={id} open={w.isOpen(id)} visible={p.visible}><aside ref={p.ref} data-panel-id={id} className={'workspace-panel independent-workspace-panel '+(p.grouped?'panel-grouped':'')} style={p.style}><div className="independent-panel-header panel-drag-header"><b>{id}</b>{controls(id)}</div>
{id==='files'?<FileExplorer entries={entries} workspaceId={info.id} root={info.root} file="" dirty={false} filter={filter} setFilter={setFilter} collapsed={collapsed} setCollapsed={setCollapsed} onOpen={async()=>{}} onAction={async input=>{window.fixture.moves.push(input);return {path:input.path,type:'file'}}} onAI={()=>{}} onReferenceDrop={source=>setSources(old=>[...old,source])}/>:id==='basis'?<InputBasisPanel request={null} file="" mode="edit" sources={sources} entries={entries} onChange={setSources} workspaceId={info.id}/>:<input aria-label={id+' input'}/>}</aside></DesktopPanel>})}
{w.tabGroups.map(group=><WorkspaceTabs key={group.id} group={group} style={group.style} label={id=>id} onSelect={w.open} onDrag={()=>{}} onRaise={()=>{}} handles={null} controls={controls(group.active)}/>)}</div></div></WorkspaceProvider>}
if(!new URLSearchParams(location.search).has('panelWindow'))createRoot(document.getElementById('root')).render(<DesktopPanelsProvider><Fixture/></DesktopPanelsProvider>);`;
async function worker(temp){
  const {app,BrowserWindow,ipcMain}=require('electron');app.setPath('userData',path.join(temp,'profile'));app.disableHardwareAcceleration();app.on('window-all-closed',()=>{});await app.whenReady();
  const {createPanelGeometry,createPanelRectHandler}=require(path.join(project,'desktop/panelGeometry.cjs')),{createPanelReadyHandler}=require(path.join(project,'desktop/panelReady.cjs'));
  const children=new Map(),readyIds=new Set(),sizeTargets=new WeakMap();let main,server;
  const geometry=createPanelGeometry({mainWindow:()=>main}),isMain=e=>e.sender===main?.webContents;
  ipcMain.on('hive:preferences-read',e=>{e.returnValue=null;});
  ipcMain.on('hive:panel-ready',createPanelReadyHandler({isMainOrigin:isMain,panelWindows:children,geometry,readyPanelIds:readyIds,sizeTargets}));
  ipcMain.on('hive:panel-rect',createPanelRectHandler({isMainSender:isMain,panelWindows:children,geometry}));
  ipcMain.on('hive:panel-close',(e,id)=>{if(isMain(e))children.get(id)?.destroy();});ipcMain.on('hive:dock-overlay',()=>{});
  try{
    server=http.createServer(async(req,res)=>{const name=new URL(req.url,'http://localhost').pathname,routes={'/':'fixture.html','/fixture.js':'fixture.js','/fixture.css':'fixture.css'};if(!routes[name]){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(temp,routes[name])));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const opts={show:false,focusable:false,skipTaskbar:true,frame:false,width:1200,height:850,webPreferences:{preload:path.join(project,'desktop/preload.cjs'),backgroundThrottling:false}};
    main=new BrowserWindow(opts);main.webContents.setWindowOpenHandler(()=>({action:'allow',overrideBrowserWindowOptions:{...opts,width:380,height:520}}));
    main.webContents.on('did-create-window',(child,{url})=>{const id=new URL(url).searchParams.get('panelWindow');children.set(id,child);child.show=()=>{};child.showInactive=()=>{};child.once('closed',()=>{if(children.get(id)===child)children.delete(id);readyIds.delete(id);});});
    await main.loadURL('http://127.0.0.1:'+server.address().port);
    const checks=await main.webContents.executeJavaScript(`(async()=>{
      const pause=()=>new Promise(r=>setTimeout(r,80)),checks=[],check=(label,ok)=>{checks.push({label,passed:!!ok});if(!ok)throw Error(label);},wait=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await pause();}throw Error('Timeout '+fn);};
      await wait(()=>window.fixture?.w);const f=()=>window.fixture,context=(element)=>{const win=element.ownerDocument.defaultView,event=new win.MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:30,clientY:40});element.dispatchEvent(event);return event.defaultPrevented;};
      f().w.minimize('files');await pause();f().w.toggleAutoHide('files');await pause();check('main shelf remains in main document',!f().d.windows.has('files')&&document.querySelector('[data-panel-id=files]').getClientRects().length);
      f().w.toggleAutoHide('files');await pause();context(document.querySelector('[data-panel-context=files]'));await pause();check('shelved icon opens its own hamburger menu',!!document.querySelector('[aria-label="files面板操作"]'));document.querySelector('[aria-label="files面板操作"] button').click();await pause();
      f().group();await pause();const inactive=[...document.querySelectorAll('[data-panel-tab]')].find(n=>n.dataset.panelTab==='files');context(inactive);await pause();check('inactive docked tab menu targets selected member '+JSON.stringify({tabs:[...document.querySelectorAll('[data-panel-tab]')].map(n=>[n.dataset.panelTab,n.getAttribute('aria-selected')]),buttons:[...document.querySelectorAll('[data-panel-menu-id]')].map(n=>[n.dataset.panelMenuId,n.getClientRects().length,n.getAttribute('aria-expanded')]),menus:[...document.querySelectorAll('[role=menu]')].map(n=>n.getAttribute('aria-label'))}),!!document.querySelector('[aria-label="files面板操作"]')); document.querySelector('[aria-label="files面板操作"] button').click();await pause();
      f().w.openDocked('files');f().w.openDocked('basis');await pause();
      const payload=()=>{const row=document.querySelector('.explorer-row[data-path="one.md"]'),data=new DataTransfer();row.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:data}));return data;};
      let data=payload(),target=document.querySelector('.reference-drop-target');target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));await pause();check('same-window reference drop works',f().sources.some(s=>s.path==='one.md'));f().resetSources();await pause();
      f().w.floatNativePanel('files');f().w.floatNativePanel('basis');await wait(()=>f().d.windows.has('files')&&f().d.windows.has('basis'));await pause();
      const from=f().d.windows.get('files'),to=f().d.windows.get('basis');
      for(const [bg,text] of [['#172218','#eef1e7'],['#f5f7ef','#243024']]){document.documentElement.style.setProperty('--hive-panel-bg',bg);document.documentElement.style.setProperty('--text',text);await new Promise(r=>setTimeout(r,1200));const childBg=to.getComputedStyle(to.document.querySelector('[data-panel-id=basis]')).backgroundColor,childText=to.getComputedStyle(to.document.querySelector('[data-panel-id=basis]')).color;check('native theme token background '+bg+' root='+to.document.documentElement.style.cssText+' main='+document.documentElement.style.cssText+' computed='+childBg,childBg===(bg==='#172218'?'rgb(23, 34, 24)':'rgb(245, 247, 239)'));check('native theme token foreground '+text,childText===(text==='#eef1e7'?'rgb(238, 241, 231)':'rgb(36, 48, 36)'));}
check('drag source and target occupy distinct native documents',from!==to&&from.document!==document&&to.document!==document);
      const row=from.document.querySelector('.explorer-row[data-path="one.md"]');data=new from.DataTransfer();row.dispatchEvent(new from.DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:data}));target=to.document.querySelector('.reference-drop-target');target.dispatchEvent(new to.DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data}));await pause();check('native target displays drop feedback',target.classList.contains('reference-drag-active'));
      target.dispatchEvent(new to.DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));await pause();check('cross-native-window payload reaches current reference session',f().sources.length===1&&f().sources[0].path==='one.md');
      const bad=new from.DataTransfer();bad.setData('application/x-hive-reference',JSON.stringify({version:1,workspace:'other',source:{path:'two.md',type:'file'}}));target.dispatchEvent(new to.DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:bad}));await pause();check('foreign-workspace drop is rejected',f().sources.length===1);
      context(to.document.querySelector('.reference-heading'));await pause();check('native body right click portals its own menu into ownerDocument',!!to.document.querySelector('[aria-label="basis面板操作"]')&&!document.querySelector('[aria-label="basis面板操作"]'));to.document.querySelector('[aria-label="basis面板操作"] button').click();await pause();
      const input=from.document.querySelector('input[aria-label="筛选文件"]');check('input context semantics remain untouched',!context(input));
      f().w.minimize('basis');await pause();f().w.toggleAutoHide('basis');await wait(()=>f().d.windows.has('basis'));check('native shelf reopens native host',f().d.windows.get('basis').document!==document);
      f().group();await pause();f().w.groupFloat('files');await wait(()=>f().d.windows.has('files')&&f().d.windows.has('basis'));await pause();const grouped=f().d.windows.get('files');check('group members share one native host',grouped===f().d.windows.get('basis'));context(grouped.document.querySelector('[data-panel-tab=files]'));await pause();check('inactive native group tab opens correct member menu',!!grouped.document.querySelector('[aria-label="files面板操作"]'));
      return checks;
    })()`);
    await fs.writeFile(path.join(output,'native-theme-validation.json'),JSON.stringify({passed:true,method:'Hidden, nonfocusable real Electron native windows and production preload/geometry/ready/React components. DataTransfer and contextmenu are synthetic DOM events, not OS mouse gestures.',checks},null,2));console.log(JSON.stringify({passed:true,checks:checks.length}));
  }finally{for(const child of children.values())child.destroy();main?.destroy();server?.close();app.exit(0);}
}
if(process.argv.includes('--worker'))worker(process.argv.at(-1)).catch(error=>{console.error(error.stack);require('electron').app.exit(1);});
else{
  await fs.mkdir(output,{recursive:true});const temp=await fs.mkdtemp(path.join(output,'.native-feedback-'));
  try{
    const {build}=await import('esbuild');await build({stdin:{contents:fixture,resolveDir:project,loader:'tsx'},bundle:true,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},jsx:'automatic',outfile:path.join(temp,'fixture.js'),logLevel:'error'});
    await fs.writeFile(path.join(temp,'fixture.html'),'<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const child=spawn((await import('electron')).default,[fileURLToPath(import.meta.url),'--worker',temp],{cwd:project,windowsHide:true,env,stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',value=>{log+=value;process.stdout.write(value);});child.stderr.on('data',value=>{log+=value;process.stderr.write(value);});
    const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Native feedback timeout'));},60000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);resolve(code);});});await fs.writeFile(path.join(output,'native-theme-validation.log'),log);assert.equal(code,0);assert.equal(JSON.parse(await fs.readFile(path.join(output,'native-theme-validation.json'),'utf8')).passed,true);
  }finally{assert.equal(path.dirname(temp),output);assert.ok(path.basename(temp).startsWith('.native-feedback-'));await fs.rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
}
