import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFile,fork,spawn} from 'node:child_process';
import {promisify} from 'node:util';

const require=createRequire(import.meta.url),here=path.dirname(fileURLToPath(import.meta.url)),project=path.resolve(here,'..');
const evidence=path.resolve(process.env.HIVE_MEMORY_EVIDENCE||path.join(project,'.runtime/memory'));
const baseline=path.resolve(process.env.HIVE_MEMORY_BASELINE||path.join(evidence,'baseline'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const count=(name,fallback)=>{const value=Number(process.env[name]||fallback);assert(Number.isSafeInteger(value)&&value>0&&value<=100000,`Invalid ${name}`);return value;};
const scale={directories:count('HIVE_MEMORY_DIRS',200),documents:count('HIVE_MEMORY_DOCS',1000),dependencyFiles:count('HIVE_MEMORY_DEPENDENCIES',10000),legacyRecords:count('HIVE_MEMORY_LEGACY',20000),samples:count('HIVE_MEMORY_SAMPLES',5)};
const safeEnv=()=>Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.toUpperCase().startsWith('HIVE_')&&key!=='ELECTRON_RUN_AS_NODE'));
async function windowsMetrics(pids){
  const query=`$pidsWanted=@(${pids.join(',')}); Get-CimInstance Win32_PerfRawData_PerfProc_Process | Where-Object { $pidsWanted -contains $_.IDProcess } | Select-Object IDProcess,WorkingSetPrivate,PrivateBytes | ConvertTo-Json -Compress`;
  const encoded=Buffer.from(query,'utf16le').toString('base64');
  const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',encoded],{windowsHide:true,maxBuffer:1024*1024});
  const data=JSON.parse(stdout||'[]');return Array.isArray(data)?data:[data];
}
async function worker(){
  const {app,BrowserWindow}=require('electron');const [port,temp,backendPid,output]=process.argv.slice(-4);app.setPath('userData',path.join(temp,'profile'));app.disableHardwareAcceleration();await app.whenReady();
  const win=new BrowserWindow({show:false,focusable:false,skipTaskbar:true,width:1600,height:1050,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const errors=[];win.webContents.on('console-message',e=>{if(e.level==='error'||e.level===3)errors.push(e.message);});
  try{
    await win.loadURL(`http://127.0.0.1:${port}`);win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Performance.enable');
    const checks=await win.webContents.executeJavaScript(`(async()=>{
      const q=s=>document.querySelector(s),wait=async(f,label)=>{for(let i=0;i<500;i++){if(f())return;await new Promise(r=>setTimeout(r,40));}throw Error('Timeout '+label);},pause=()=>new Promise(r=>setTimeout(r,300));
      await wait(()=>q('.explorer-row[data-path="性能验收.md"]'),'synthetic document');q('.explorer-row[data-path="性能验收.md"]').click();await wait(()=>q('.document-pane .cm-content')?.textContent.includes('固定性能验收内容'),'document open');
      const mode=async text=>{q('[aria-label="正文 1显示模式"]').click();await wait(()=>q('.display-mode-menu'),'mode menu');const b=[...q('.display-mode-menu').querySelectorAll('button')].find(x=>x.textContent.includes(text));if(!b)throw Error('Missing '+text);b.click();await pause();};
      await mode('代码模式');await wait(()=>q('.document-pane .cm-editor[data-display-mode="source"]'),'source mode');await mode('左右分栏');await wait(()=>q('.split-source .cm-content'),'split mode');
      q('[aria-label="设置"]').click();await wait(()=>q('.settings-page'),'settings open');q('[aria-label="关闭设置"]').click();await wait(()=>!q('.settings-page'),'settings closed');
      q('[aria-label="面板"]').click();await wait(()=>q('[aria-label="草稿显示"]'),'panel switch');const sw=()=>q('[aria-label="草稿显示"]'),initial=sw().getAttribute('aria-checked');sw().click();await wait(()=>sw().getAttribute('aria-checked')!==initial,'panel toggle');sw().click();await wait(()=>sw().getAttribute('aria-checked')===initial,'panel restore');q('[aria-label="关闭面板管理"]').click();
      return {documentOpen:true,sourceMode:true,splitMode:true,settingsOpenClose:true,toolPanelToggleRestore:true};
    })()`);
    await delay(7000);const samples=[],sync=[];let treeVersion,hash;
    for(let i=0;i<scale.samples;i++){
      const syncResult=await win.webContents.executeJavaScript(`(async()=>{const response=await fetch('/api/workspace/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paths:['性能验收.md'],${hash===undefined?'':`baselines:{'性能验收.md':${JSON.stringify(hash)}},`}${treeVersion===undefined?'':`treeVersion:${JSON.stringify(treeVersion)},`}})});const body=await response.text();if(!response.ok)throw Error(body);const data=JSON.parse(body);return {bytes:new TextEncoder().encode(body).length,keys:Object.keys(data),treeVersion:data.treeVersion,entriesPresent:Object.hasOwn(data,'entries'),files:data.files.map(file=>({path:file.path,hash:file.hash,unchanged:file.unchanged===true,textLength:typeof file.text==='string'?file.text.length:null,error:file.error}))};})()`);
      if(syncResult.treeVersion!==undefined)treeVersion=syncResult.treeVersion;if(syncResult.files[0]?.hash)hash=syncResult.files[0].hash;sync.push(syncResult);
      const metrics=await win.webContents.debugger.sendCommand('Performance.getMetrics');const map=Object.fromEntries(metrics.metrics.map(x=>[x.name,x.value]));const rendererPid=win.webContents.getOSProcessId();
      const os=await windowsMetrics([rendererPid,Number(backendPid)]);assert(os.some(row=>Number(row.IDProcess)===rendererPid)&&os.some(row=>Number(row.IDProcess)===Number(backendPid)),'Missing Windows process memory counters');
      samples.push({time:new Date().toISOString(),rendererPid,backendPid:Number(backendPid),os,jsHeapUsedBytes:map.JSHeapUsedSize,jsHeapTotalBytes:map.JSHeapTotalSize});await delay(2000);
    }
    assert.deepEqual(errors,[],'Renderer console errors');await fs.writeFile(output,JSON.stringify({passed:true,electronVersion:process.versions.electron,method:'Production frontend, isolated backend, hidden nonfocusable offscreen Electron; synthetic UI events; no forced GC. Windows raw private working set and private bytes; CDP JS heap.',scale,checks,sync,samples,consoleErrors:errors},null,2)+'\n');
    win.webContents.debugger.detach();win.destroy();app.exit(0);
  }catch(error){await fs.writeFile(output,JSON.stringify({passed:false,error:error.stack,consoleErrors:errors},null,2)+'\n');if(!win.isDestroyed())win.destroy();app.exit(1);}
}
async function fixture(temp){
  const docs=path.join(temp,'documents'),state=path.join(temp,'state');await fs.mkdir(docs,{recursive:true});await fs.mkdir(state,{recursive:true});
  const dirs=Array.from({length:scale.directories},(_,i)=>path.join(docs,`folder-${String(i).padStart(4,'0')}`));await Promise.all(dirs.map(d=>fs.mkdir(d)));
  await fs.writeFile(path.join(docs,'性能验收.md'),'# 固定性能验收内容\n\n'+('这是合成文稿，用于隔离内存测试。\n\n'.repeat(120)));
  for(let i=0;i<scale.documents;i+=100)await Promise.all(Array.from({length:Math.min(100,scale.documents-i)},(_,j)=>fs.writeFile(path.join(dirs[(i+j)%dirs.length],`doc-${i+j}.md`),`# 文稿 ${i+j}\n\n合成文稿，不含用户数据。\n`)));
  const depRoot=path.join(docs,'node_modules');await fs.mkdir(depRoot);const deps=Array.from({length:100},(_,i)=>path.join(depRoot,`package-${i}`));await Promise.all(deps.map(d=>fs.mkdir(d)));
  for(let i=0;i<scale.dependencyFiles;i+=100)await Promise.all(Array.from({length:Math.min(100,scale.dependencyFiles-i)},(_,j)=>fs.writeFile(path.join(deps[(i+j)%deps.length],`dependency-${i+j}.js`),'export const synthetic = true;\n')));
  const legacy=Object.fromEntries(Array.from({length:scale.legacyRecords},(_,i)=>[`old/removed-${i}.md`,{dev:1,ino:i+1,birthtimeMs:1600000000000,createdAt:1600000000000}]));
  const legacyText=JSON.stringify(legacy);await fs.writeFile(path.join(state,'file-times.json'),legacyText);return {docs,state,legacyBytes:Buffer.byteLength(legacyText)};
}
async function run(label,root){
  await fs.access(path.join(root,'dist/index.html'));await fs.mkdir(evidence,{recursive:true});const temp=await fs.mkdtemp(path.join(evidence,'.memory-fixture-'));let server,child,serverLog='',workerLog='';
  const result=path.join(evidence,`${label}-memory.json`);
  try{await fs.copyFile(result,path.join(evidence,`${label}-memory-previous-${Date.now()}.json`));}catch(error){if(error.code!=='ENOENT')throw error;}
  await fs.rm(result,{force:true});await fs.rm(path.join(evidence,`${label}-memory-failure.log`),{force:true});
  try{
    const data=await fixture(temp);console.log(`${label}: fixture ready, legacy ${data.legacyBytes} bytes`);
    server=fork(path.join(root,'server/index.mjs'),['--production'],{cwd:root,silent:true,windowsHide:true,env:{...safeEnv(),HIVE_PORT:'0',HIVE_DOCUMENTS:data.docs,HIVE_STATE_DIR:data.state,HIVE_API_KEY:''}});
    server.stdout.on('data',v=>serverLog+=v);server.stderr.on('data',v=>serverLog+=v);
    const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Backend timeout')),30000);server.once('error',reject);server.once('exit',code=>reject(Error('Backend exited '+code)));server.on('message',m=>{if(m?.type==='hive-ready'){clearTimeout(timer);resolve(m.port);}});});
    child=spawn((await import('electron')).default,[fileURLToPath(import.meta.url),'--memory-worker',String(port),temp,String(server.pid),result],{cwd:root,windowsHide:true,env:{...safeEnv(),HIVE_MEMORY_DIRS:String(scale.directories),HIVE_MEMORY_DOCS:String(scale.documents),HIVE_MEMORY_DEPENDENCIES:String(scale.dependencyFiles),HIVE_MEMORY_LEGACY:String(scale.legacyRecords),HIVE_MEMORY_SAMPLES:String(scale.samples)},stdio:['ignore','pipe','pipe']});child.stdout.on('data',v=>workerLog+=v);child.stderr.on('data',v=>workerLog+=v);
    const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Renderer timeout'));},180000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);resolve(code);});});assert.equal(code,0,'Worker failed');
    const output=JSON.parse(await fs.readFile(result,'utf8'));output.fixture={...scale,rootDocumentCount:1,legacyBytes:data.legacyBytes};await fs.writeFile(result,JSON.stringify(output,null,2)+'\n');console.log(`${label}: complete, ${output.samples.length} samples`);
  }catch(error){await fs.writeFile(path.join(evidence,`${label}-memory-failure.log`),error.stack+'\n'+workerLog+'\n'+serverLog);throw error;}
  finally{
    await fs.writeFile(path.join(evidence,`${label}-memory-worker.log`),workerLog);await fs.writeFile(path.join(evidence,`${label}-memory-server.log`),serverLog);
    if(child&&child.exitCode===null&&!child.killed)child.kill();if(server&&server.exitCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill();});
    const resolved=path.resolve(temp);assert.equal(path.dirname(resolved),evidence);assert(path.basename(resolved).startsWith('.memory-fixture-'));await fs.rm(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
}
if(process.argv.includes('--memory-worker'))void worker().catch(error=>{console.error(error.stack);require('electron').app.exit(1);});
else{const mode=process.argv[2];assert(['baseline','candidate','all'].includes(mode),'Usage: node scripts/verify-memory.mjs baseline|candidate|all');if(mode==='baseline'||mode==='all')await run('baseline',baseline);if(mode==='candidate'||mode==='all')await run('candidate',project);}
