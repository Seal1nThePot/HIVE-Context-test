import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'delivery/status-drag-20261118'),require=createRequire(import.meta.url);
async function worker(temporary,mode){
 const {app,BrowserWindow}=require('electron');app.setPath('userData',path.join(temporary,'profile'));app.disableHardwareAcceleration();await app.whenReady();
 const win=new BrowserWindow({show:false,focusable:false,skipTaskbar:true,width:1000,height:800,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 win.webContents.on('console-message',event=>console.log('renderer:',event.message));
 win.webContents.setWindowOpenHandler(()=>({action:'allow',overrideBrowserWindowOptions:{show:false,focusable:false,skipTaskbar:true,width:1000,height:800,webPreferences:{offscreen:false,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}}}));
 win.webContents.on('did-create-window',child=>{child.setContentSize(1000,800);});
 try{
  await win.loadFile(path.join(temporary,'fixture.html'));
  const result=await win.webContents.executeJavaScript(`(async()=>{
   const checks=[],pause=()=>new Promise(r=>setTimeout(r,80)),wait=async(fn,label)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,40));}throw Error('Timeout '+label);};
   const check=(name,value)=>{checks.push({name,passed:!!value});if(!value)throw Error(name);};
   const setup=async(where)=>{window.harness.mount(where);await wait(()=>window.harness.document()===(where==='child'?window.harness.child().document:document)&&window.harness.document().querySelector('.status-customizer'),'mount '+where);let d=window.harness.document();d.querySelector('.status-customizer-summary button').click();await wait(()=>d.querySelector('.status-customizer-panel'),'expand');return d;};
   const items=()=>JSON.parse(localStorage.getItem('hive.editor-status.v3')).items;
   const shown=d=>d.querySelector('[data-status-zone="shown"]'),available=d=>d.querySelector('[data-status-zone="available"]');
   const find=(container,text)=>[...container.querySelectorAll('button')].find(e=>e.textContent.trim()===text);
   const pt=(el,side='center')=>{const r=el.getBoundingClientRect();return {x:side==='left'?r.left+2:side==='right'?r.right-2:r.left+r.width/2,y:r.top+r.height/2};};
   const send=(target,type,p)=>target.dispatchEvent(new target.ownerDocument.defaultView.PointerEvent(type,{bubbles:true,cancelable:true,pointerId:7,pointerType:'mouse',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,clientX:p.x,clientY:p.y}));
   const start=(el)=>send(el,'pointerdown',pt(el));
   const move=(d,el,side)=>send(d.body,'pointermove',pt(el,side));
   const end=(d,el,side)=>send(d.body,'pointerup',pt(el,side));
   const drag=async(d,el,to,side='center')=>{start(el);move(d,to,side);await pause();end(d,to,side);await pause();};
   await wait(()=>window.harness,'fixture ready');localStorage.clear();localStorage.setItem('hive.editor-status.v3',JSON.stringify({version:3,items:['count'],countMode:'characters'}));let d=await setup('child');
   check('portal is rendered in a distinct Electron window document',d!==document&&d.defaultView!==window&&!!window.harness.child());
   check('main document has no status trays at child coordinates',!document.querySelector('[data-status-zone]'));
   check('child viewport and hit testing are live',d.defaultView.innerWidth>0&&d.defaultView.innerHeight>0&&!!d.elementFromPoint(pt(shown(d).querySelector('[data-status-index="0"]'),'left').x,pt(shown(d).querySelector('[data-status-index="0"]'),'left').y)?.closest('[data-status-zone="shown"]'));
   await drag(d,find(available(d),'保存状态'),shown(d).querySelector('[data-status-index="0"]'),'left');
   check('child available item dragged into shown before count '+JSON.stringify({items:items(),point:pt(shown(d),'left'),size:[d.defaultView.innerWidth,d.defaultView.innerHeight],rect:shown(d).getBoundingClientRect().toJSON(),hit:d.elementFromPoint(pt(shown(d),'left').x,pt(shown(d),'left').y)?.outerHTML.slice(0,250)}),JSON.stringify(items())===JSON.stringify(['save','count']));
   await drag(d,d.querySelector('[aria-label="拖动字符数排序"]'),shown(d).querySelector('[data-status-index="0"]'),'left');
   check('child reorder',JSON.stringify(items())===JSON.stringify(['count','save']));
   await drag(d,d.querySelector('[aria-label="拖动保存状态排序"]'),available(d));
   check('child drag back removes item',JSON.stringify(items())===JSON.stringify(['count']));
   start(find(available(d),'保存状态'));move(d,shown(d));await pause();send(d.body,'pointerup',{x:950,y:750});await pause();
   check('dropping outside cancels',JSON.stringify(items())===JSON.stringify(['count']));
   start(find(available(d),'保存状态'));move(d,shown(d));await pause();let escaped=0;d.addEventListener('keydown',e=>{if(e.key==='Escape')escaped++;});find(available(d),'保存状态').dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await pause();end(d,shown(d));await pause();
   check('escape cancels drag and preserves settings',JSON.stringify(items())===JSON.stringify(['count'])&&!!d.querySelector('.status-customizer-panel')&&escaped===0);
   start(find(available(d),'保存状态'));move(d,shown(d));await pause();send(d.body,'pointercancel',pt(shown(d)));await pause();end(d,shown(d));await pause();
   check('pointercancel clears pending drag',JSON.stringify(items())===JSON.stringify(['count']));
   const lost=find(available(d),'保存状态');start(lost);move(d,shown(d));await pause();send(lost,'lostpointercapture',pt(lost));await pause();end(d,shown(d));await pause();
   check('lost pointer capture clears pending drag',JSON.stringify(items())===JSON.stringify(['count']));
   start(find(available(d),'保存状态'));move(d,shown(d));await pause();d.defaultView.dispatchEvent(new Event('blur'));await pause();end(d,shown(d));await pause();
   check('window blur clears pending drag',JSON.stringify(items())===JSON.stringify(['count']));
   const normal=find(available(d),'保存状态');start(normal);send(normal,'pointerup',pt(normal));normal.dispatchEvent(new d.defaultView.MouseEvent('click',{bubbles:true,detail:1}));await pause();check('ordinary pointer click adds item',JSON.stringify(items())===JSON.stringify(['count','save']));
   let select=d.querySelector('[aria-label="总字数统计方式"]');select.value='text';select.dispatchEvent(new d.defaultView.Event('change',{bubbles:true}));await pause();check('count mode persists',JSON.parse(localStorage.getItem('hive.editor-status.v3')).countMode==='text'&&!!d.querySelector('[aria-label="拖动纯字数排序"]'));
   const availableItem=find(available(d),'总行数');start(availableItem);move(d,shown(d));await pause();send(d.body,'pointerup',{x:950,y:750});availableItem.dispatchEvent(new d.defaultView.MouseEvent('click',{bubbles:true,detail:1}));await pause();check('cancelled drag does not add on subsequent pointer click',!items().includes('lines'));
   window.harness.mount('main');await wait(()=>document.querySelector('.status-customizer'),'main mount');d=document;d.querySelector('.status-customizer-summary button').click();await wait(()=>d.querySelector('.status-customizer-panel'),'main expand');
   const mainSource=find(available(d),'段落数量'),mainTarget=shown(d).querySelector('[data-status-index="0"]');
   check('main source and target are hit-testable in viewport',d.defaultView.innerWidth>0&&d.defaultView.innerHeight>0&&!!d.elementFromPoint(pt(mainSource).x,pt(mainSource).y)?.closest('[data-status-zone="available"]')&&!!d.elementFromPoint(pt(mainTarget,'left').x,pt(mainTarget,'left').y)?.closest('[data-status-zone="shown"]'));
   const prior=items().slice();await drag(d,mainSource,mainTarget,'left');check('main window drag remains functional',items()[0]==='paragraphs'&&items().length===prior.length+1);
   return {checks,finalPreference:JSON.parse(localStorage.getItem('hive.editor-status.v3'))};
  })()`);
  await fs.writeFile(path.join(out,mode+'-validation.json'),JSON.stringify({passed:true,method:'Hidden nonfocusable Electron main and child windows; React main root portals the production component to child document. Synthetic DOM PointerEvents; no desktop input.',...result},null,2));
  console.log(JSON.stringify({passed:true,checks:result.checks.length}));win.destroy();app.exit(0);
 }catch(error){console.error(error.stack);await fs.writeFile(path.join(out,mode+'-failure.png'),(await win.webContents.capturePage()).toPNG());win.destroy();app.exit(1);}
}
if(process.argv.includes('--worker'))void worker(process.argv.at(-2),process.argv.at(-1)).catch(e=>{console.error(e.stack);require('electron').app.exit(1);});
else{
 await fs.mkdir(out,{recursive:true});const temporary=await fs.mkdtemp(path.join(out,'.status-drag-'));const mode=process.argv.includes('--before')?'before':'current';
 try{
  const fixture=path.join(temporary,'fixture.tsx');
  await fs.writeFile(fixture,`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {createPortal} from 'react-dom';import StatusBarSettings from '../../../src/features/editor/StatusBarSettings';import {useStatusPreferences} from '../../../src/features/editor/EditorStatusBar';import '../../../src/features/settings/settings.css';
const child=window.open(new URL('child.html',location.href).href,'status-drag-child','width=1000,height=800')!;
async function boot(){for(let i=0;i<150&&(!child.innerWidth||!child.innerHeight||!child.document.getElementById('portal'));i++)await new Promise(r=>setTimeout(r,40));if(!child.innerWidth)throw Error('Child viewport unavailable');for(const node of document.head.querySelectorAll('link[rel=stylesheet],style'))child.document.head.append(node.cloneNode(true));
function Harness(){const [where,setWhere]=useState('main'),prefs=useStatusPreferences();(window as any).harness={mount:setWhere,document:()=>where==='child'?child.document:document,child:()=>child};const component=<div className="settings-content"><StatusBarSettings preferences={prefs}/></div>;return where==='child'?createPortal(component,child.document.getElementById('portal')!):component;}createRoot(document.getElementById('root')!).render(<Harness/>);}void boot();`);
  const {build}=await import('esbuild');const plugin={name:'before',setup(builder){builder.onLoad({filter:/StatusBarSettings\.tsx$/},async args=>({contents:await fs.readFile(path.join(out,'StatusBarSettings.before.tsx'),'utf8'),loader:'tsx',resolveDir:path.dirname(args.path)}));}};
  await build({entryPoints:[fixture],bundle:true,platform:'browser',format:'esm',outfile:path.join(temporary,'fixture.js'),loader:{'.css':'css','.woff2':'dataurl','.woff':'dataurl','.ttf':'dataurl'},plugins:mode==='before'?[plugin]:[]});
  await fs.writeFile(path.join(temporary,'fixture.html'),'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><style>body{margin:0;padding:60px;background:#eee}.settings-content{width:800px}</style><div id="root"></div><script type="module" src="fixture.js"></script>');
  await fs.writeFile(path.join(temporary,'child.html'),'<!doctype html><meta charset="utf-8"><div id="portal"></div>');
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const child=spawn((await import('electron')).default,[fileURLToPath(import.meta.url),'--worker',temporary,mode],{cwd:root,windowsHide:true,env,stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
  const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('timeout'));},45000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);resolve(code);});});await fs.writeFile(path.join(out,mode+'.log'),log);console.log(log);assert.equal(code,0,'status drag verification failed');
 }finally{const resolved=path.resolve(temporary);assert.equal(path.dirname(resolved),path.resolve(out));assert.ok(path.basename(resolved).startsWith('.status-drag-'));await fs.rm(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
}
