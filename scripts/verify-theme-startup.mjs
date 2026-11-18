import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';

const project=fileURLToPath(new URL('../',import.meta.url));
const output=path.resolve(process.env.HIVE_VERIFY_OUTPUT||path.join(project,'.runtime/theme-startup'));
const packaged=process.argv.includes('--package');
const bundle=path.resolve(process.env.HIVE_VERIFY_BUNDLE||path.join(project,'release'));
const runtime=packaged?path.join(bundle,'win-unpacked/resources/app.asar'):project;
const require=createRequire(import.meta.url);
const hexToRgb=hex=>'rgb('+[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)).join(', ')+')';

async function worker(fixture) {
  const {app,dialog,session}=require('electron');
  const profile=path.join(fixture,'profile');
  process.env.HIVE_DESKTOP_USER_DATA=profile;
  process.env.HIVE_TEMPLATES_SOURCE=path.join(fixture,'no-source-override');
  process.env.HIVE_API_KEY='';
  app.setPath('userData',profile);
  if(!app.isReady())app.disableHardwareAcceleration();
  const scenario=JSON.parse(await fs.readFile(path.join(fixture,'scenario.json'),'utf8'));
  const held=[],attempts=[];
  let workspaceRequests=0,templateRequests=0,started=0,workspaceStarted=0,catalogStarted=0;
  const timeout=setTimeout(()=>{console.error('No startup presentation within 15 seconds');app.exit(1);},15000);
  dialog.showErrorBox=(title,message)=>{console.error(title,message);app.exit(1);};
  app.on('browser-window-created',(_event,win)=>{
    win.setFocusable(false);
    win.setSkipTaskbar(true);
    win.focus=()=>{};
    const reveal=method=>{
      const attemptedAt=performance.now();
      attempts.push(method);
      if(attempts.length>1)return;
      void (async()=>{
        assert.equal(win.isVisible(),false,'Test window remains hidden');
        const frame=await win.webContents.executeJavaScript(`(() => {
          const loading=document.querySelector('.workspace-loading');
          return {
            accent:document.documentElement.style.getPropertyValue('--hive-accent'),
            workspace:document.documentElement.style.getPropertyValue('--hive-workspace-bg'),
            background:getComputedStyle(document.documentElement).backgroundColor,
            loading:loading&&getComputedStyle(loading).backgroundColor
          };
        })()`);
        const nativeBackground=win.getBackgroundColor().toLowerCase();
        await fs.writeFile(path.join(output,scenario.name+'-first-frame.png'),(await win.capturePage(undefined,{stayHidden:true})).toPNG());
        const result={name:scenario.name,elapsedMs:Math.round(attemptedAt-started),afterWorkspaceRequestMs:Math.round(attemptedAt-workspaceStarted),nativeBackground,frame,workspaceRequests,templateRequests,attempts};
        await fs.writeFile(path.join(fixture,'result.json'),JSON.stringify(result,null,2));
        console.log(JSON.stringify(result));
        assert.equal(frame.accent,scenario.accent,'First presentation accent');
        assert.equal(frame.workspace,scenario.workspace,'First presentation workspace color');
        assert.equal(frame.background,hexToRgb(scenario.workspace),'First presentation document background');
        assert.equal(frame.loading,hexToRgb(scenario.panel),'First presentation loading screen');
        assert.equal(nativeBackground,scenario.workspace,'Native background at first presentation');
        assert.ok(workspaceRequests>0,'Workspace request was held during presentation');
        assert.ok(templateRequests>0,'Template catalog request made');
        if(scenario.holdTemplates)assert.equal(held.filter(entry=>entry.kind==='template').length,1,'Presented without resolving the template API');
        if(scenario.delayCatalogMs)assert.ok(attemptedAt-catalogStarted>=scenario.delayCatalogMs,'Presentation waited for the saved template');
        if(scenario.name==='corrupt')assert.ok(attemptedAt-workspaceStarted<1800,'Corrupt preferences do not stall startup');
        assert.deepEqual(attempts,['show'],'No earlier startup reveal');
        clearTimeout(timeout);
        for(const entry of held)entry.callback({cancel:true});
        app.exit(0);
      })().catch(error=>{console.error(error.stack);app.exit(1);});
    };
    win.show=()=>reveal('show');
    win.showInactive=()=>reveal('showInactive');
    win.webContents.on('did-start-navigation',(_event,url,isInPlace,isMainFrame)=>{
      if(isMainFrame&&!isInPlace&&url.startsWith('http://127.0.0.1:'))started=performance.now();
    });
  });
  await app.whenReady();
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://127.0.0.1/*']},(detail,callback)=>{
    const route=new URL(detail.url).pathname;
    if(route==='/api/workspace'){
      if(!workspaceRequests)workspaceStarted=performance.now();
      workspaceRequests++;
      held.push({kind:'workspace',callback});
      return;
    }
    if(route.startsWith('/api/templates')){
      templateRequests++;
      if(scenario.holdTemplates){
        held.push({kind:'template',callback});
        return;
      }
      if(route==='/api/templates'&&scenario.delayCatalogMs){
        catalogStarted=performance.now();
        setTimeout(()=>callback({}),scenario.delayCatalogMs);
        return;
      }
    }
    callback({});
  });
  await import(pathToFileURL(path.join(runtime,'desktop/main.mjs')).href);
}

async function verify() {
  await fs.mkdir(output,{recursive:true});
  const temporary=await fs.mkdtemp(path.join(output,'.theme-startup-'));
  const themeId='claude-mediterranean-blue';
  const blue=JSON.parse(await fs.readFile(path.join(project,'templates',themeId,'colors.json'),'utf8'));
  const identity=JSON.parse(await fs.readFile(path.join(project,'templates',themeId,'template.json'),'utf8'));
  const base='white',accent='#27698c',workspace='#c1dce9';
  const saved={...blue,base,templateId:themeId,
    colors:{...blue.colorProfiles[base],accent},
    colorProfiles:{...blue.colorProfiles,[base]:{...blue.colorProfiles[base],accent}},
    surfaceColors:{...blue.surfaceColors,[base]:{...blue.surfaceColors[base],workspace}},
    templateBinding:{...identity,defaults:blue}};
  const builtin={accent:blue.colorProfiles[blue.base].accent,workspace:blue.surfaceColors[blue.base].workspace,panel:blue.surfaceColors[blue.base].panel};
  const scenarios=[
    {name:'cached',raw:JSON.stringify(saved),accent,workspace,panel:saved.surfaceColors[base].panel,holdTemplates:true},
    {name:'legacy',raw:JSON.stringify({templateId:themeId}),delayCatalogMs:950,...builtin},
    {name:'fresh',...builtin},
    {name:'corrupt',raw:'bad theme JSON',accent:'#c3b57d',workspace:'#171b17',panel:'#1b1f1b',holdTemplates:true},
  ];
  const executable=(await import('electron')).default,results=[];
  try {
    for(const scenario of scenarios){
      const fixture=path.join(temporary,scenario.name);
      await fs.mkdir(path.join(fixture,'profile'),{recursive:true});
      if(scenario.raw!==undefined)await fs.writeFile(path.join(fixture,'profile/ui-preferences.json'),JSON.stringify({'hive.theme.v1':scenario.raw}));
      await fs.writeFile(path.join(fixture,'scenario.json'),JSON.stringify(scenario));
      const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
      const child=spawn(executable,[fileURLToPath(import.meta.url),'--worker',...(packaged?['--package']:[]),fixture],{cwd:project,windowsHide:true,env,stdio:['ignore','pipe','pipe']});
      let log='';
      child.stdout.on('data',chunk=>{log+=chunk;});child.stderr.on('data',chunk=>{log+=chunk;});
      const code=await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{child.kill();reject(new Error('Startup fixture timed out: '+scenario.name));},25000);
        child.once('error',error=>{clearTimeout(timer);reject(error);});
        child.once('exit',value=>{clearTimeout(timer);resolve(value);});
      });
      await fs.writeFile(path.join(output,scenario.name+'-startup.log'),log);
      assert.equal(code,0,scenario.name+' startup failed\n'+log);
      results.push(JSON.parse(await fs.readFile(path.join(fixture,'result.json'),'utf8')));
    }
    const result={passed:true,method:'Production main/preload/renderer in hidden, nonfocusable Electron. The show calls are captured before any native window is exposed.',results};
    await fs.writeFile(path.join(output,'startup-theme-validation.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result));
  }finally{
    const resolved=await fs.realpath(temporary);
    assert.equal(path.dirname(resolved),await fs.realpath(output));
    assert.ok(path.basename(resolved).startsWith('.theme-startup-'));
    await fs.rm(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:150});
  }
}

if(process.argv.includes('--worker'))void worker(process.argv.at(-1)).catch(error=>{console.error(error.stack);require('electron').app.exit(1);});
else await verify();
