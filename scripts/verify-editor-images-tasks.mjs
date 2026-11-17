import assert from 'node:assert/strict';
import {fixtureImage} from './fixture-image.mjs';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {fork,spawn} from 'node:child_process';

const project=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(project,'delivery/editor-enhancements-20261118');
const require=createRequire(import.meta.url);
async function worker(port,temporary){
  const {app,BrowserWindow}=require('electron');app.setPath('userData',path.join(temporary,'profile'));app.disableHardwareAcceleration();await app.whenReady();
  const window=new BrowserWindow({show:false,focusable:false,skipTaskbar:true,width:900,height:700,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const errors=[];window.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
  try{
    await window.loadURL(`http://127.0.0.1:${port}/fixture`);
    const result=await window.webContents.executeJavaScript(`(async()=>{
      const checks=[];const check=(name,pass,detail)=>{checks.push({name,passed:!!pass,detail});if(!pass)throw new Error(name+': '+JSON.stringify(detail));};
      const wait=async(fn,label)=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('timeout: '+label);};
      await wait(()=>window.fixture?.ready,'fixture');const f=window.fixture;
      await wait(()=>document.querySelectorAll('#main .cm-preview-image img').length===3,'three image elements');
      await wait(()=>[...document.querySelectorAll('#main .cm-preview-image img')].every(img=>img.complete&&img.naturalWidth>0),'image decoding');
      const images=[...document.querySelectorAll('#main .cm-preview-image img')].map(img=>({alt:img.alt,width:img.naturalWidth,height:img.naturalHeight,src:img.getAttribute('src')}));
      check('wiki image loaded',images[0].alt==='含空格 中文同目录图.png'&&images[0].width>0,images[0]);
      check('relative Markdown image loaded',images[1].alt==='相对图'&&images[1].width>0,images[1]);
      check('reference image loaded',images[2].alt==='引用图'&&images[2].width>0,images[2]);
      check('URLs bind to current document and workspace',images.every(img=>{const url=new URL(img.src,location.href);return url.searchParams.get('document')==='资料/文章.md'&&url.searchParams.get('workspace')===f.workspace;}),images);
      f.main.dispatch({effects:f.setPreviewFocus.of(true),selection:{anchor:0}});
      const wiki=()=>document.querySelector('#main .cm-preview-image img[alt="含空格 中文同目录图.png"]');
      check('image visible with cursor at same line start',!!wiki(),null);
      wiki().dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0}));
      check('click reveals image source on same line',!wiki()&&f.main.state.selection.main.head===1,{selection:f.main.state.selection.main.head});
      f.main.dispatch({selection:{anchor:f.main.state.doc.line(1).to}});
      check('moving to same line end restores image',!!wiki(),{selection:f.main.state.selection.main.head});
      wiki().dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0}));
      check('click from same line end reveals source',!wiki()&&f.main.state.selection.main.head===1,{selection:f.main.state.selection.main.head});
      f.main.dispatch({selection:{anchor:0}});check('moving to same line start restores image',!!wiki(),null);
      f.main.dispatch({effects:f.setPreviewFocus.of(false)});
      const scroller=document.querySelector('#main .cm-scroller');scroller.scrollTop=scroller.scrollHeight;await new Promise(r=>setTimeout(r,150));
      check('editor scrolls to lower content',scroller.scrollTop>0,{top:scroller.scrollTop,height:scroller.scrollHeight,client:scroller.clientHeight});
      scroller.scrollTop=0;await new Promise(r=>setTimeout(r,150));
      const original=f.main.state.doc.toString(),at=original.indexOf('引用%20图.png');f.main.dispatch({changes:{from:at,to:at+'引用%20图.png'.length,insert:'更新%20图.png'}});
      await wait(()=>{const img=[...document.querySelectorAll('#main .cm-preview-image img')].find(i=>i.alt==='引用图');return img&&img.getAttribute('src').includes('%E6%9B%B4%E6%96%B0')&&img.complete&&img.naturalWidth>0;},'updated reference image');
      check('changed reference reloads image',[...document.querySelectorAll('#main .cm-preview-image img')].some(i=>i.alt==='引用图'&&i.naturalWidth>0&&i.getAttribute('src').includes('%E6%9B%B4%E6%96%B0')),null);
      const button=()=>document.querySelector('#main .cm-preview-task');
      check('unchecked control rendered',button()?.getAttribute('aria-checked')==='false',button()?.outerHTML);
      button().click();check('click checks source',f.main.state.doc.toString().includes('- [x] 待办')&&button()?.getAttribute('aria-checked')==='true',f.main.state.doc.toString());
      button().click();check('click unchecks source',f.main.state.doc.toString().includes('- [ ] 待办')&&button()?.getAttribute('aria-checked')==='false',f.main.state.doc.toString());
      check('undo restores checked state',f.undo(f.main)&&f.main.state.doc.toString().includes('- [x] 待办'),f.main.state.doc.toString());
      check('second undo restores unchecked state',f.undo(f.main)&&f.main.state.doc.toString().includes('- [ ] 待办'),f.main.state.doc.toString());
      check('redo restores checked state',f.redo(f.main)&&f.main.state.doc.toString().includes('- [x] 待办'),f.main.state.doc.toString());
      check('second redo restores unchecked state',f.redo(f.main)&&f.main.state.doc.toString().includes('- [ ] 待办'),f.main.state.doc.toString());
      const locked=document.querySelector('#readonly .cm-preview-task');check('readonly control disabled',locked?.disabled===true,locked?.outerHTML);locked.click();check('readonly source unchanged',f.readonly.state.doc.toString()==='- [ ] 只读',f.readonly.state.doc.toString());
      f.main.dispatch({effects:f.setDisplayMode.of('source')});check('source mode has no task controls',!button(),null);
      f.main.dispatch({effects:f.setDisplayMode.of('live')});check('task control restored after source mode',!!button(),null);
      return {checks,images};
    })()`);
    assert.equal(errors.length,0,errors.join('\n'));
    await fs.writeFile(path.join(output,'images-tasks-render-validation.json'),JSON.stringify({passed:true,checkedAt:new Date().toISOString(),method:'Hidden nonfocusable Electron, current bundled editor extensions and isolated real image backend; DOM clicks only.',...result,consoleErrors:errors},null,2));
    await fs.writeFile(path.join(output,'images-tasks-preview.png'),(await window.webContents.capturePage()).toPNG());
    console.log(JSON.stringify({passed:true,checks:result.checks.length,images:result.images.map(image=>({alt:image.alt,width:image.width,height:image.height}))}));window.destroy();app.exit(0);
  }catch(error){console.error(error.stack);await fs.writeFile(path.join(output,'images-tasks-failure.png'),(await window.webContents.capturePage()).toPNG()).catch(()=>{});window.destroy();app.exit(1);}
}
if(process.argv.includes('--images-tasks-worker'))void worker(Number(process.argv.at(-2)),process.argv.at(-1)).catch(error=>{console.error(error.stack);require('electron').app.exit(1);});
else{
  await fs.mkdir(output,{recursive:true});const temporary=await fs.mkdtemp(path.join(output,'.images-tasks-check-'));
  let backend,fixtureServer;
  try{
    const root=path.join(temporary,'workspace'),folder=path.join(root,'资料'),shared=path.join(root,'共享'),state=path.join(temporary,'state');
    await fs.mkdir(folder,{recursive:true});await fs.mkdir(shared,{recursive:true});
    await fs.writeFile(path.join(folder,'文章.md'),'fixture');
    await Promise.all([path.join(folder,'含空格 中文同目录图.png'),path.join(shared,'相对 图.png'),path.join(folder,'引用 图.png'),path.join(folder,'更新 图.png')].map(file=>fs.writeFile(file,fixtureImage)));
    backend=fork(path.join(project,'server/index.mjs'),['--production'],{cwd:project,silent:true,windowsHide:true,env:{...process.env,HIVE_PORT:'0',HIVE_DOCUMENTS:root,HIVE_STATE_DIR:state,HIVE_API_KEY:''}});
    let serverLog='';backend.stdout.on('data',data=>serverLog+=data);backend.stderr.on('data',data=>serverLog+=data);
    const backendPort=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('backend timeout')),15000);backend.once('error',reject);backend.once('exit',code=>reject(Error('backend exited '+code)));backend.on('message',message=>{if(message?.type==='hive-ready'){clearTimeout(timer);resolve(message.port);}});});
    const entry=`import {EditorState} from '@codemirror/state';import {EditorView} from '@codemirror/view';import {history,undo,redo} from '@codemirror/commands';import {markdownDisplayExtensions,configureImageContext,setDisplayMode,setPreviewFocus} from './src/features/editor/markdownDisplay';
      const response=await fetch('/api/workspace');const workspace=(await response.json()).id;
      const text='![[含空格 中文同目录图.png]]\\n\\n![相对图](../共享/相对%20图.png)\\n\\n![引用图][pic]\\n\\n[pic]: 引用%20图.png\\n\\n- [ ] 待办';
      const main=new EditorView({state:EditorState.create({doc:text,extensions:[history(),markdownDisplayExtensions]}),parent:document.querySelector('#main')});configureImageContext(main,{file:'资料/文章.md',workspace});
      const readonly=new EditorView({state:EditorState.create({doc:'- [ ] 只读',extensions:[history(),markdownDisplayExtensions,EditorState.readOnly.of(true)]}),parent:document.querySelector('#readonly')});
      window.fixture={main,readonly,workspace,undo,redo,setDisplayMode,setPreviewFocus,ready:true};`;
    const {build}=await import('esbuild');const bundle=await build({stdin:{contents:entry,resolveDir:project,sourcefile:'fixture.ts',loader:'ts'},bundle:true,format:'esm',platform:'browser',write:false,plugins:[{name:'ignore-ancillary-css',setup(build){build.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));}}]});
    const html='<!doctype html><html><meta charset="utf-8"><style>.cm-editor{height:520px}.cm-scroller{overflow:auto}</style><body><div id="main"></div><div id="readonly"></div><script type="module" src="/fixture.js"></script></body></html>';
    fixtureServer=http.createServer((req,res)=>{
      if(req.url==='/fixture'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);return;}
      if(req.url==='/fixture.js'){res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});res.end(bundle.outputFiles[0].contents);return;}
      if(req.url?.startsWith('/api/')){const proxy=http.request({hostname:'127.0.0.1',port:backendPort,path:req.url,method:req.method,headers:{...req.headers,host:`127.0.0.1:${backendPort}`}},upstream=>{res.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(res);});proxy.on('error',error=>res.destroy(error));req.pipe(proxy);return;}
      res.writeHead(404);res.end();
    });
    await new Promise(resolve=>fixtureServer.listen(0,'127.0.0.1',resolve));const port=fixtureServer.address().port;
    const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;const electron=(await import('electron')).default;
    const child=spawn(electron,[fileURLToPath(import.meta.url),'--images-tasks-worker',String(port),temporary],{cwd:project,windowsHide:true,env:environment,stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',data=>log+=data);child.stderr.on('data',data=>log+=data);
    const status=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Electron timeout'));},30000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);resolve(code);});});
    await fs.writeFile(path.join(output,'images-tasks-render.log'),log);await fs.writeFile(path.join(output,'images-tasks-server.log'),serverLog);console.log(log);assert.equal(status,0,'Electron verification failed');
  }finally{
    if(fixtureServer)await new Promise(resolve=>fixtureServer.close(resolve));
    if(backend&&backend.exitCode===null)await new Promise(resolve=>{backend.once('exit',resolve);backend.send({type:'hive-shutdown'});});
    const resolved=path.resolve(temporary);assert.equal(path.dirname(resolved),path.resolve(output));assert.ok(path.basename(resolved).startsWith('.images-tasks-check-'));await fs.rm(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
}
