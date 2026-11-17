import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url)),output=path.join(root,'delivery/text-colors-20261118');
const require=createRequire(import.meta.url);
async function worker(temporary){
  const {app,BrowserWindow}=require('electron');
  app.setPath('userData',path.join(temporary,'profile'));app.disableHardwareAcceleration();
  // Register readiness before the first await in Electron's ESM entry point.
  const ready=app.whenReady();await ready;
  const window=new BrowserWindow({show:false,focusable:false,skipTaskbar:true,width:1000,height:700,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  try{
    await window.loadFile(path.join(temporary,'fixture.html'));
    const result=await window.webContents.executeJavaScript(`(async()=>{
      const overrides=document.createElement('style');document.head.append(overrides);
      for(const sheet of document.styleSheets)if(sheet.ownerNode!==overrides)overrides.textContent+=testTheme.compileThemeRules(sheet.cssRules,new Map(),true);
      const results=[];
      for(const [base,colors] of [['black',{uiText:'#d4aaee',mutedText:'#9cb48a',documentText:'#b5cdef',ribbonTitleText:'#ffcc99',ribbonContentText:'#99ddcc'}],['white',{uiText:'#263c8a',mutedText:'#67548a',documentText:'#16543b',ribbonTitleText:'#9b2539',ribbonContentText:'#3b477a'}]]){
        const theme=testTheme.normalizeTheme({...testTheme.defaultTheme,base,surfaceColors:{[base]:colors}});testTheme.applyThemeTokens(document.documentElement,theme);
        // Product buttons animate color for 150 ms; inspect their settled paint.
        await new Promise(resolve=>setTimeout(resolve,220));
        const assertions=[];for(const [selector,role] of [['.setting-row-title','uiText'],['.setting-row-info p','mutedText'],['.theme-detail-grid > div > span','uiText'],['.theme-role-grid code','mutedText'],['.settings-page input[type=text]','uiText'],['.settings-sidebar nav button','uiText'],['.app-header button','uiText'],['.sidebar-title','uiText'],['.workspace-tabs button','uiText'],['.cm-line','documentText'],['.cm-markdown-h1','documentText'],['.office-ribbon .ribbon-tabs button','ribbonTitleText'],['.office-ribbon .ribbon-body button','ribbonContentText']]){
          const actual=getComputedStyle(document.querySelector(selector)).color,hex=colors[role],expected='rgb('+[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')+')';assertions.push({selector,role,actual,expected,passed:actual===expected});
        }
        results.push({base,colors,assertions});
      }
      const controls=['界面文字与图标','辅助文字','正文文字','编辑栏标题文字','编辑栏工具区图标与文字'].map(label=>({label,color:!!document.querySelector('[aria-label="'+label+'颜色选择"]'),hex:!!document.querySelector('[aria-label="'+label+'颜色值"]')}));
      return {results,controls,automaticLabelPresent:document.body.textContent.includes('自动 ·')||document.body.textContent.includes('自动黑白')};
    })()`);
    await fs.writeFile(path.join(output,'render-observed.json'),JSON.stringify(result,null,2));
    for(const item of result.results)for(const check of item.assertions)assert.equal(check.passed,true,item.base+' '+check.selector+' '+check.actual+' expected '+check.expected);
    for(const check of result.controls){assert.equal(check.color,true,check.label);assert.equal(check.hex,true,check.label);}
    assert.equal(result.automaticLabelPresent,false);
    const report={checkedAt:new Date().toISOString(),method:'Hidden, nonfocusable Electron fixture using current built CSS, actual theme application, compatibility compiler and settings SSR; no user input.',...result,passed:true};
    await fs.writeFile(path.join(output,'render-validation.json'),JSON.stringify(report,null,2));
    await fs.writeFile(path.join(output,'text-preview.png'),(await window.webContents.capturePage()).toPNG());
    console.log(JSON.stringify({passed:true,palettes:result.results.length,computedStyleChecks:result.results.reduce((n,item)=>n+item.assertions.length,0),editableTextFields:result.controls.length}));window.destroy();app.exit(0);
  }catch(error){console.error(error.stack);window.destroy();app.exit(1);}
}

if(process.argv.includes('--text-worker'))void worker(process.argv.at(-1)).catch(error=>{console.error(error.stack);require('electron').app.exit(1);});
else{
  await fs.mkdir(output,{recursive:true});const temporary=await fs.mkdtemp(path.join(output,'.text-render-'));
  try{
    const {build}=await import('esbuild');await build({stdin:{contents:"export {applyThemeTokens} from './src/features/theme/applyTheme';export {compileThemeRules} from './src/features/theme/themeStyles';export {normalizeTheme,defaultTheme} from './src/features/theme/themePreferences';",resolveDir:root},bundle:true,platform:'browser',format:'iife',globalName:'testTheme',outfile:path.join(temporary,'theme.js')});
    const {createServer}=await import('vite');const vite=await createServer({root,configFile:path.join(root,'vite.config.ts'),logLevel:'error',server:{middlewareMode:true,hmr:false,ws:false,watch:null},optimizeDeps:{noDiscovery:true,include:[],entries:[]},appType:'custom'});
    let markup;try{const settings=await vite.ssrLoadModule('/src/features/theme/ThemeSettings.tsx'),React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');markup=renderToStaticMarkup(React.createElement(settings.default));}finally{await vite.close();}
    const css=(await fs.readdir(path.join(root,'dist/assets'))).filter(name=>name.endsWith('.css'));assert.equal(css.length,1);
    await fs.writeFile(path.join(temporary,'fixture.html'),`<!doctype html><html><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(path.join(root,'dist/assets',css[0])).href}"><script src="theme.js"></script><body><main class="app-shell"><div class="app-header"><button>标题栏</button></div><div class="sidebar-title">面板标题</div><div class="workspace-tabs"><button aria-selected="true">选中标签</button></div><div class="office-ribbon"><div class="ribbon-tabs"><button>编辑栏标题</button></div><div class="ribbon-body"><button>工具区</button></div></div><div class="document-pane"><div class="cm-editor"><div class="cm-content"><div class="cm-line">自定义正文文字</div><span class="cm-markdown-h1">正文标题</span></div></div></div><div class="settings-page"><aside class="settings-sidebar"><nav><button>外观</button></nav></aside><div class="settings-content">${markup}<div class="theme-role-grid"><code>辅助文字预览</code></div></div></div></main></body></html>`);
    const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;const electron=(await import('electron')).default;
    const child=spawn(electron,[fileURLToPath(import.meta.url),'--text-worker',temporary],{cwd:root,windowsHide:true,env:environment,stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',chunk=>{log+=chunk;});child.stderr.on('data',chunk=>{log+=chunk;});
    const status=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('Text render verification timeout'));},30000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);resolve(code);});});await fs.writeFile(path.join(output,'render.log'),log);console.log(log);assert.equal(status,0);
  }finally{
    const resolved=path.resolve(temporary);assert.equal(path.dirname(resolved),path.resolve(output));assert.ok(path.basename(resolved).startsWith('.text-render-'));await fs.rm(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
}
