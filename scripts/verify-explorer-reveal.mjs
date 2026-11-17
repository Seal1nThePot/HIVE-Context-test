import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn,fork,execFile} from 'node:child_process';
import {promisify} from 'node:util';

const require=createRequire(import.meta.url),project=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(project,'delivery/explorer-reveal-20261118');
const run=promisify(execFile);
async function inspect(target,close=false){
  const script=`[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false);$ErrorActionPreference='Stop';$target=$env:HIVE_REVEAL_TEST_TARGET;$folder=[IO.Path]::GetDirectoryName($target);$shell=New-Object -ComObject Shell.Application;$result=@();foreach($window in @($shell.Windows())){try{if($window.Document.Folder.Self.Path -eq $folder){$selected=@();foreach($item in @($window.Document.SelectedItems())){$selected+=$item.Path};$result+=@{handle=[long]$window.HWND;folder=$folder;selected=$selected};if($env:HIVE_REVEAL_TEST_CLOSE -eq '1'){$window.Quit()}}}catch{}};ConvertTo-Json -InputObject @($result) -Compress`;
  const result=await run('powershell.exe',['-NoProfile','-NonInteractive','-STA','-Command',script],{windowsHide:true,timeout:12000,env:{...process.env,HIVE_REVEAL_TEST_TARGET:target,HIVE_REVEAL_TEST_CLOSE:close?'1':'0'}});
  return JSON.parse(result.stdout.trim()||'[]');
}
if(process.argv.includes('--reveal-worker')){
 async function worker(){
  const {app,shell}=require('electron');app.setPath('userData',path.join(process.argv.at(-1),'profile'));await app.whenReady();
  const temp=process.argv.at(-1),target=path.join(temp,'documents/中文 & 空格.md');let backend,log='';
  try{
    const {createFileRevealHandler}=require('../desktop/fileReveal.cjs');const handler=createFileRevealHandler({shell});
    backend=fork(path.join(project,'server/index.mjs'),['--production'],{execPath:process.execPath,cwd:project,silent:true,windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',HIVE_DESKTOP_SHELL:'1',HIVE_DOCUMENTS:path.dirname(target),HIVE_STATE_DIR:path.join(temp,'state'),HIVE_PORT:'0',HIVE_API_KEY:''}});
    backend.stdout.on('data',value=>log+=value);backend.stderr.on('data',value=>log+=value);
    let nativeRequests=0;
    backend.on('message',message=>{if(message?.type==='hive-reveal-file'){nativeRequests++;void handler(message).then(reply=>{if(backend.connected)backend.send(reply);});}});
    const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Backend startup timeout')),15000);backend.on('message',message=>{if(message?.type==='hive-ready'){clearTimeout(timer);resolve(message.port);}});backend.once('error',reject);backend.once('exit',()=>reject(Error('Backend exited '+log)));});
    assert.equal((await inspect(target)).length,0,'Synthetic folder must not already be open');
    const response=await fetch('http://127.0.0.1:'+port+'/api/explorer',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'reveal',path:path.basename(target)})});
    const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.ok,true);
    let windows=[];for(let i=0;i<15;i++){windows=await inspect(target);if(windows.some(window=>window.selected.includes(target)))break;await new Promise(resolve=>setTimeout(resolve,200));}
    await fs.writeFile(path.join(output,'native-observation.json'),JSON.stringify({target,windows,nativeRequests},null,2)+'\n');
    assert.equal(nativeRequests,1);assert.ok(windows.some(window=>window.selected.includes(target)),'Explorer must open the containing folder and select the synthetic Unicode file');
    await fs.writeFile(path.join(output,'native-validation.json'),JSON.stringify({passed:true,method:'Actual backend HTTP -> private desktop IPC -> Electron native shell, observed Explorer Shell.Application folder and selected items; no desktop mouse or keyboard input. Only the synthetic folder window was closed afterwards.',nativeRequests,target,windows},null,2)+'\n');
    console.log(JSON.stringify({passed:true,nativeRequests,selectedSyntheticFile:true}));
  }catch(error){console.error(error.stack);process.exitCode=1;}
  finally{await inspect(target,true).catch(()=>{});if(backend&&backend.exitCode===null)await new Promise(resolve=>{backend.once('exit',resolve);backend.kill();});await fs.writeFile(path.join(output,'native-server.log'),log);app.exit(process.exitCode||0);}
 }
 void worker().catch(error=>{console.error(error.stack);require('electron').app.exit(1);});
}else{
  await fs.mkdir(output,{recursive:true});const temp=await fs.mkdtemp(path.join(output,'native-check-'));await fs.mkdir(path.join(temp,'documents'));await fs.writeFile(path.join(temp,'documents/中文 & 空格.md'),'本次资源管理器调用的合成验证文件，不含用户资料。');
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn((await import('electron')).default,[fileURLToPath(import.meta.url),'--reveal-worker',temp],{cwd:project,windowsHide:true,env,stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',v=>log+=v);child.stderr.on('data',v=>log+=v);
  const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Native reveal timeout'));},60000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);resolve(code);});});await fs.writeFile(path.join(output,'native-validation.log'),log);console.log(log);assert.equal(code,0);
}
