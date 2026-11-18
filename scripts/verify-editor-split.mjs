import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'delivery/editor-enhancements-20261118'),require=createRequire(import.meta.url);
if(process.argv.includes('--split-test-worker')){
 async function worker(){
 const {app,BrowserWindow}=require('electron');app.setPath('userData',path.join(out,'split-test-profile'));app.disableHardwareAcceleration();await app.whenReady();
 const win=new BrowserWindow({show:false,focusable:false,skipTaskbar:true,width:1100,height:700,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 try{await win.loadFile(path.join(out,'split-fixture.html'));
 const result=await win.webContents.executeJavaScript(`(async()=>{
 const t=window.testSplit, wait=()=>new Promise(r=>setTimeout(r,100)), checks={};let a=t.source(),b=t.main();await wait();
 const same=()=>a.state.doc.eq(b.state.doc);
 checks.views=!!a&&!!b&&a!==b;
 a.dispatch({changes:{from:0,insert:'SOURCE '},selection:{anchor:7},userEvent:'input.type'});checks.sourceEdit=same()&&b.state.doc.sliceString(0,7)==='SOURCE ';checks.selection=a.state.selection.main.head===b.state.selection.main.head;
 b.dispatch({changes:{from:b.state.doc.length,insert:' LIVE'},userEvent:'input.type'});checks.liveEdit=same()&&a.state.doc.sliceString(a.state.doc.length-5)===' LIVE';
 checks.undo=t.undo()&&same()&&!b.state.doc.toString().endsWith(' LIVE');checks.redo=t.redo()&&same()&&b.state.doc.toString().endsWith(' LIVE');
 await wait();a.scrollDOM.scrollTop=1200;a.scrollDOM.dispatchEvent(new Event('scroll'));await wait();checks.scroll=b.scrollDOM.scrollTop>300;await wait();b.scrollDOM.scrollTop=2100;b.scrollDOM.dispatchEvent(new Event('scroll'));await wait();checks.reverseScroll=a.scrollDOM.scrollTop>500;
 t.mode('live');checks.switchLive=!t.source();t.mode('split');a=t.source();b=t.main();await wait();checks.switchBack=same();checks.restoredScroll=a.scrollDOM.scrollTop>500;checks.historyAfterSwitch=t.undo()&&same()&&!b.state.doc.toString().endsWith(' LIVE');
 const content=a.contentDOM;content.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));a.dispatch({changes:{from:0,insert:'中'},userEvent:'input.type.compose'});content.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中'}));checks.syntheticComposition=same()&&b.state.doc.sliceString(0,1)==='中';
 b.setState(t.create('# 第二份文件\\n新内容'));checks.replaceState=same()&&a.state.doc.toString()==='# 第二份文件\\n新内容';checks.newHistory=!t.undo();
 a.dispatch({changes:{from:a.state.doc.length,insert:' 修改'},userEvent:'input.type'});checks.editAfterReplacement=same()&&b.state.doc.toString().endsWith(' 修改');a.contentDOM.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));checks.sourceUndo=same()&&!b.state.doc.toString().endsWith(' 修改');a.contentDOM.dispatchEvent(new KeyboardEvent('keydown',{key:'y',ctrlKey:true,bubbles:true,cancelable:true}));checks.sourceRedo=same()&&b.state.doc.toString().endsWith(' 修改');
 b.dispatch({changes:{from:0,to:b.state.doc.length,insert:'磁盘重新读取'},userEvent:'input.disk-sync'});checks.diskReload=same()&&a.state.doc.toString()==='磁盘重新读取';
 t.makeReadOnly(b);checks.readOnlyTransition=a.state.readOnly&&a.contentDOM.getAttribute('contenteditable')==='false';
 const prior=b.state.doc.toString();a.dispatch({changes:{from:0,insert:'禁止'}});checks.dynamicReadOnlyBlocks=same()&&b.state.doc.toString()===prior;
 b.setState(t.create('只读文件',true));checks.replaceReadOnly=same()&&a.state.readOnly&&a.contentDOM.getAttribute('contenteditable')==='false';
 b.setState(t.create('可写文件'));checks.replaceWritable=same()&&!a.state.readOnly&&a.contentDOM.getAttribute('contenteditable')==='true';
 t.mount(true);a=t.source();b=t.main();const before=b.state.doc.toString();a.dispatch({changes:{from:0,insert:'blocked'},userEvent:'input.type'});checks.readOnly=b.state.doc.toString()===before&&a.state.doc.eq(b.state.doc)&&a.contentDOM.getAttribute('contenteditable')==='false';
 return checks;
 })()`);await fs.writeFile(path.join(out,'split-ui-validation.json'),JSON.stringify({method:'Hidden nonfocusable Electron, actual Editor component; synthetic composition, not real IME',checks:result},null,2));for(const [name,value] of Object.entries(result))assert.equal(value,true,name);console.log(JSON.stringify(result));win.destroy();app.exit(0);
 }catch(error){console.error(error.stack);win.destroy();app.exit(1);}
 }
 void worker();
}else{
 const {build}=await import('esbuild');await build({entryPoints:[path.join(out,'split-fixture.tsx')],bundle:true,platform:'browser',format:'iife',outfile:path.join(out,'split-fixture.js'),loader:{'.css':'css','.woff2':'dataurl','.woff':'dataurl','.ttf':'dataurl'}});
 await fs.writeFile(path.join(out,'split-fixture.html'),'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="split-fixture.css"><style>.editor-host{flex:1;min-height:0;overflow:hidden}</style><div id="root"></div><script src="split-fixture.js"></script>');
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const electron=(await import('electron')).default;const child=spawn(electron,[fileURLToPath(import.meta.url),'--split-test-worker'],{cwd:root,windowsHide:true,env,stdio:'pipe'});let log='';child.stdout.on('data',v=>log+=v);child.stderr.on('data',v=>log+=v);const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('timeout'));},40000);child.once('exit',code=>{clearTimeout(timer);resolve(code);});child.once('error',reject);});await fs.writeFile(path.join(out,'split-ui.log'),log);console.log(log);assert.equal(code,0);
}



