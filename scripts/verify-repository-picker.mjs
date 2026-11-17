import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const project=fileURLToPath(new URL('../',import.meta.url)),output=path.join(project,'delivery/repository-picker-20261118'),require=createRequire(import.meta.url);
async function worker(temporary){
  const {app,BrowserWindow,ipcMain}=require('electron');
  app.setPath('userData',path.join(temporary,'profile'));app.disableHardwareAcceleration();await app.whenReady();
  ipcMain.on('hive:preferences-read',event=>{event.returnValue=null;});
  const window=new BrowserWindow({show:false,focusable:false,skipTaskbar:true,webPreferences:{preload:path.join(project,'desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,offscreen:true}});
  const calls=[];let response={canceled:false,filePaths:[path.join(temporary,'selected-folder')]};
  const {createRepositoryPicker}=require(path.join(project,'desktop/repositoryPicker.cjs'));
  ipcMain.handle('hive:repository-directory',createRepositoryPicker({isMainOrigin:event=>event.sender===window.webContents&&event.senderFrame?.url.startsWith('file:'),getParent:()=>window,showOpenDialog:async(parent,options)=>{calls.push({owned:parent===window,options});return response;}}));
  try {
    await fs.writeFile(path.join(temporary,'fixture.html'),'<!doctype html><meta charset="utf-8"><title>Internal picker verification</title>');
    await window.loadFile(path.join(temporary,'fixture.html'));
    const first=await window.webContents.executeJavaScript('window.hiveDesktop.chooseRepositoryDirectory()');assert.equal(first,response.filePaths[0]);
    response={canceled:true,filePaths:[]};assert.equal(await window.webContents.executeJavaScript('window.hiveDesktop.chooseRepositoryDirectory()'),null);
    response={canceled:false,filePaths:[path.join(temporary,'second-folder')]};assert.equal(await window.webContents.executeJavaScript('window.hiveDesktop.chooseRepositoryDirectory()'),response.filePaths[0]);
    assert.equal(calls.length,3);for(const call of calls){assert.equal(call.owned,true);assert.deepEqual(call.options.properties,['openDirectory']);}
    await fs.writeFile(path.join(output,'ipc-validation.json'),JSON.stringify({passed:true,method:'Internal hidden Electron; production sandboxed preload and IPC handler, with a simulated OS dialog response. No visible system dialog or desktop input.',selectedPath:first,cancelReturnsNull:true,reopenAfterCancel:true,calls},null,2));
    console.log(JSON.stringify({passed:true,ipcCalls:calls.length,productionPreload:true,simulatedSystemDialog:true}));window.destroy();app.exit(0);
  }catch(error){console.error(error.stack);window.destroy();app.exit(1);}
}
if(process.argv.includes('--picker-worker'))void worker(process.argv.at(-1)).catch(error=>{console.error(error.stack);require('electron').app.exit(1);});
else{
  await fs.mkdir(output,{recursive:true});const temporary=await fs.mkdtemp(path.join(output,'.ipc-check-'));
  try {
    const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
    const child=spawn((await import('electron')).default,[fileURLToPath(import.meta.url),'--picker-worker',temporary],{cwd:project,windowsHide:true,env:environment,stdio:['ignore','pipe','pipe']});let log='';
    child.stdout.on('data',data=>log+=data);child.stderr.on('data',data=>log+=data);
    const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('Picker IPC validation timeout'));},30000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);resolve(code);});});
    await fs.writeFile(path.join(output,'ipc.log'),log);console.log(log);assert.equal(code,0);
  }finally{const resolved=path.resolve(temporary);assert.equal(path.dirname(resolved),path.resolve(output));assert.ok(path.basename(resolved).startsWith('.ipc-check-'));await fs.rm(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
}
