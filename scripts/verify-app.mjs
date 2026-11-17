import assert from 'node:assert/strict';
import {fixtureImage} from './fixture-image.mjs';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {fork,spawn} from 'node:child_process';
const project=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
const pkg=JSON.parse(await fs.readFile(path.join(project,'package.json'),'utf8'));
const output=path.resolve(process.env.HIVE_VERIFY_OUTPUT||path.join(project,'.runtime/checks'));
const packaged=process.argv.includes('--package'),bundle=path.join(project,'release'),prefix=packaged?'packaged':'source';
async function worker(){
  const {app,BrowserWindow}=require('electron');app.setPath('userData',path.join(process.argv.at(-1),'profile'));app.disableHardwareAcceleration();await app.whenReady();
  const win=new BrowserWindow({show:false,focusable:false,skipTaskbar:true,width:1600,height:1050,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const errors=[];win.webContents.on('console-message',e=>{if(e.level==='error'||e.level===3)errors.push(e.message);});
  try{
    await win.loadURL('http://127.0.0.1:'+process.argv.at(-2));
    const result=await win.webContents.executeJavaScript(`(async()=>{
      const checks=[],get=s=>document.querySelector(s),pause=()=>new Promise(r=>setTimeout(r,200));
      const check=(label,value,detail)=>{checks.push({label,passed:!!value,detail});if(!value)throw new Error(label+' '+JSON.stringify(detail));};
      const wait=async(fn,label)=>{for(let i=0;i<220;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw new Error('Timeout '+label);};
      await wait(()=>get('.explorer-row[data-path="整合验收.md"]'),'file explorer');
      check('file tree initially collapses nested folders',!get('.explorer-row[data-path="章节/一.md"]'));
      check('permanent batch action bar is absent',!get('.explorer-selection'));
      get('.explorer-row[data-path="整合验收.md"]').click();await wait(()=>get('.cm-preview-image img')?.naturalWidth>0,'wiki image');
      check('wiki image decodes through packaged image API',get('.cm-preview-image img').naturalWidth>0);
      await wait(()=>get('.cm-preview-task'),'task');get('.cm-preview-task').click();await wait(()=>get('.cm-preview-task')?.getAttribute('aria-checked')==='true','task toggle');check('task toggles in integrated app',true);
      const mode=async text=>{get('[aria-label="正文 1显示模式"]').click();await wait(()=>get('.display-mode-menu'),'mode menu');[...document.querySelectorAll('.display-mode-menu button')].find(b=>b.textContent.includes(text)).click();await pause();};
      await mode('代码模式');await wait(()=>get('.document-pane .cm-editor[data-display-mode=source]'),'code mode');
      const editor=()=>get('.document-pane .split-main .cm-editor');
      check('code mode displays logical line numbers',getComputedStyle(editor().querySelector('.cm-gutters')).display!=='none'&&editor().querySelector('.cm-lineNumbers').textContent.includes('1'));
      check('code mode shows original Markdown',editor().querySelector('.cm-content').textContent.includes('![[示例 图.png]]'));
      await mode('左右分栏');await wait(()=>get('.split-source .cm-content'),'source pane');await new Promise(r=>setTimeout(r,800));
      check('split source has line numbers and preview hides them',getComputedStyle(get('.split-source .cm-gutters')).display!=='none'&&getComputedStyle(get('.split-main .cm-gutters')).display==='none');
      check('split projects actual visual breaks',get('.split-source').querySelectorAll('.cm-split-projected-break').length>0);
      const wordRect=(root,text)=>{const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);for(let node;node=walker.nextNode();){const at=node.textContent.indexOf(text);if(at>=0){const range=document.createRange();range.setStart(node,at);range.setEnd(node,at+text.length);return range.getClientRects()[0];}}return null;};
      for(const text of ['整合验收','最终入口：']){const a=wordRect(get('.split-source .cm-content'),text),b=wordRect(get('.split-main .cm-content'),text);check('split character alignment '+text,!!a&&!!b&&Math.abs(a.top-b.top)<=3,{source:a?.top,preview:b?.top});}
      check('source pane follows fixed projection without natural wrap',getComputedStyle(get('.split-source .cm-content')).whiteSpace==='pre');
      const table=()=>get('.split-main [data-table-widget]');await wait(()=>table()?.querySelector('[data-table-action="column-after"]'),'table actions');table().querySelector('textarea[data-row="1"][data-col="0"]').focus();table().querySelector('[data-table-action="column-after"]').click();await pause();check('table quick insert renders three columns',table().querySelectorAll('th').length===3);
      const editableCell=table().querySelector('[data-cell="1:0"]');editableCell.querySelector('.cm-table-cell-preview').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));await pause();const input=editableCell.querySelector('textarea');check('table preview enters source editing on double click',!input.hidden);Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'整合联动内容');input.dispatchEvent(new Event('input',{bubbles:true}));await pause();check('live table edit updates source',get('.split-source .cm-content').textContent.includes('整合联动内容'));input.blur();input.dispatchEvent(new FocusEvent('blur'));await pause();check('table returns to rendered cell on synthetic blur',!table().querySelector('[data-cell="1:0"] .cm-table-cell-preview').hidden);
      get('[aria-label="设置"]').click();await wait(()=>get('.settings-page'),'settings');[...document.querySelectorAll('[aria-label="设置分类"] button')].find(b=>b.textContent==='外观').click();await wait(()=>get('.editor-color-settings'),'editor colors');
      check('editor page colors and alpha controls are integrated',get('.editor-color-settings').querySelectorAll('input[type=color]').length===15&&get('.editor-color-settings').querySelectorAll('input[type=range]').length===8);
      const field=get('[aria-label="选中文字高亮颜色值"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'#b374d977');field.dispatchEvent(new Event('input',{bubbles:true}));await pause();check('editor highlight changes independently',document.documentElement.style.getPropertyValue('--hive-editor-selection-background')==='#b374d977');
      get('[aria-label="关闭设置"]').click();await pause();
      get('[aria-label="仓库管理"]').click();await wait(()=>get('.repository-card'),'repository manager');check('shared repository manager is integrated',!!get('.repository-current')&&!!get('.repository-rename')&&!get('.repository-auto-save'));
      [...get('.repository-card-actions').querySelectorAll('button')].find(b=>b.textContent.includes('返回写作')).click();await pause();
      const build=await(await fetch('/build-info.json')).json();check('current build metadata is present',build.version===${JSON.stringify(pkg.version)}&&!!build.buildNumber);
      const menuAction=async(path,text)=>{const row=get('.explorer-row[data-path="'+path+'"]');if(!row)throw Error('Missing file '+path);row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,button:2,clientX:110,clientY:240}));await wait(()=>get('.explorer-menu'),'file menu');const button=[...get('.explorer-menu').querySelectorAll('button')].find(b=>b.textContent.includes(text));if(!button)throw Error('Missing menu '+text);button.click();await pause();};
      const trash=async path=>{await menuAction(path,'删除到回收站');await wait(()=>get('dialog[aria-label="删除到回收站"]'),'delete confirmation');[...get('dialog[aria-label="删除到回收站"]').querySelectorAll('button')].find(b=>b.textContent==='移到回收站').click();await wait(()=>!get('.explorer-row[data-path="'+path+'"]'),'delete complete');await pause();};
      const open=async(path,text)=>{get('.explorer-row[data-path="'+path+'"]').click();await wait(()=>get('.document-pane .cm-content')?.textContent.includes(text),'open '+path);};
      await open('删除当前.md','删除当前唯一内容');await trash('删除当前.md');
      check('deleting the current document removes its content and returns to landing',!!get('.document-new-page')&&!get('.document-pane')?.textContent.includes('删除当前唯一内容'));
      check('deleted file is absent from disk',(await fetch('/api/file?path='+encodeURIComponent('删除当前.md'))).status===404);
      get('.document-tab-close')?.click();await pause();check('closing deleted document does not demand save or duplicate',!document.body.textContent.includes('文档未能保存或保存期间有新修改'));
      await open('整合验收.md','整合验收');await menuAction('删除其他.md','在新标签页中打开');await wait(()=>get('.document-pane .cm-content')?.textContent.includes('删除其他唯一内容'),'open other tab');
      await trash('删除其他.md');check('deleting another document preserves the existing document',get('.document-pane .cm-content')?.textContent.includes('整合验收')&&!get('.document-pane')?.textContent.includes('删除其他唯一内容'));
      const folder=get('.explorer-row[data-path="删除文件夹"]');folder.click();await wait(()=>get('.explorer-row[data-path="删除文件夹/子稿.md"]'),'expand delete folder');await open('删除文件夹/子稿.md','后代删除唯一内容');await trash('删除文件夹');
      check('deleting a folder removes its open descendant content',!get('.document-pane')?.textContent.includes('后代删除唯一内容'));
      await open('整合验收.md','整合验收');
      await new Promise(resolve=>setTimeout(resolve,900));
      return {checks,build};
    })()`);
    assert.deepEqual(errors,[],'Renderer console errors');await fs.writeFile(path.join(output,prefix+'-app-preview.png'),(await win.webContents.capturePage()).toPNG());
    await fs.writeFile(path.join(output,prefix+'-app-validation.json'),JSON.stringify({passed:true,method:'Hidden nonfocusable Electron, complete frozen integrated frontend and isolated real backend; synthetic DOM events, no desktop input.',...result,consoleErrors:errors},null,2)+'\n');console.log(JSON.stringify({passed:true,checks:result.checks.length,build:result.build}));win.destroy();app.exit(0);
  }catch(error){await fs.writeFile(path.join(output,prefix+'-app-failure.png'),(await win.webContents.capturePage()).toPNG());console.error(error.stack);win.destroy();app.exit(1);}
}
if(process.argv.includes('--integrated-worker'))void worker().catch(error=>{console.error(error.stack);require('electron').app.exit(1);});
else{
  await fs.mkdir(output,{recursive:true});const temp=await fs.mkdtemp(path.join(output,'.app-check-'));let server,serverLog='';
  try{
    const docs=path.join(temp,'documents');await fs.mkdir(path.join(docs,'章节'),{recursive:true});
    await fs.writeFile(path.join(docs,'章节/一.md'),'内部验证文稿。');
    await fs.writeFile(path.join(docs,'删除当前.md'),'删除当前唯一内容。');await fs.writeFile(path.join(docs,'删除其他.md'),'删除其他唯一内容。');await fs.mkdir(path.join(docs,'删除文件夹'));await fs.writeFile(path.join(docs,'删除文件夹/子稿.md'),'后代删除唯一内容。');
    await fs.writeFile(path.join(docs,'示例 图.png'),fixtureImage);
    const paragraph='这是用于整合验证的中文与 English mixed text，数字 12345、标点和很长的网址 https://example.org/research/2026/notes?language=English&version=12345 都保持原文。';
    await fs.writeFile(path.join(docs,'整合验收.md'),'# 整合验收\n\n> **最终入口：** '+paragraph.repeat(2)+'\n\n![[示例 图.png]]\n\n- [ ] 整合待办\n\n| 标题甲 | 标题乙 |\n| :--- | ---: |\n| 内容甲 | 内容乙 |\n\n这是本轮合成资料，不含用户文稿。\n');
    const appRoot=packaged?path.join(bundle,'win-unpacked'):null,backend=appRoot?path.join(appRoot,'resources/app.asar/server/index.mjs'):path.join(project,'server/index.mjs');
    server=fork(backend,['--production'],{execPath:appRoot?path.join(appRoot,'HIVE markdown editor.exe'):process.execPath,cwd:project,silent:true,windowsHide:true,env:{...process.env,...(appRoot?{ELECTRON_RUN_AS_NODE:'1'}:{}),HIVE_PORT:'0',HIVE_DOCUMENTS:docs,HIVE_STATE_DIR:path.join(temp,'state'),HIVE_API_KEY:''}});server.stdout.on('data',v=>serverLog+=v);server.stderr.on('data',v=>serverLog+=v);
    const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Integrated backend timeout')),15000);server.once('error',reject);server.once('exit',code=>{clearTimeout(timer);reject(new Error('Integrated backend exited '+code+'\n'+serverLog));});server.on('message',m=>{if(m?.type==='hive-ready'){clearTimeout(timer);resolve(m.port);}});});
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const child=spawn((await import('electron')).default,[fileURLToPath(import.meta.url),'--integrated-worker',String(port),temp],{cwd:project,windowsHide:true,env,stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',v=>log+=v);child.stderr.on('data',v=>log+=v);
    const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('Integrated UI timeout'));},45000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);resolve(code);});});await fs.writeFile(path.join(output,prefix+'-app.log'),log);console.log(log);assert.equal(code,0);
  }finally{await fs.writeFile(path.join(output,prefix+'-server.log'),serverLog);if(server&&server.exitCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill();});const resolved=path.resolve(temp);assert.equal(path.dirname(resolved),path.resolve(output));assert.ok(path.basename(resolved).startsWith('.app-check-'));await fs.rm(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
}
