import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {dockIconPayload} from '../shared/iconPack.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'delivery/docking-colors-20261118');
const require=createRequire(import.meta.url);
const schema=require('../desktop/docking-colors.json');
const fields=Object.keys(schema);
const variable=key=>'--hive-dock-'+key.replace(/[A-Z]/g,value=>'-'+value.toLowerCase());
function checked(assertions){
  for(const {name,actual,expected} of assertions)assert.deepEqual(actual,expected,name);
  return assertions.map(assertion=>({...assertion,passed:true}));
}
const palettes={
  blue:{guideBackground:'#edf5fffa',guideIcon:'#075985',guideBorder:'#2563eb',activeBackground:'#2563ebf2',activeIcon:'#ffffff',activeBorder:'#0f172a',regionBackground:'#0ea5e933',regionBorder:'#1d4ed8b3',previewBackground:'#38bdf844',previewBorder:'#0369a1',railBackground:'#3b82f622',railActiveBackground:'#0284c788',railBorder:'#075985cc',ghostBackground:'#dbeafeef',ghostIcon:'#1e3a8a',ghostOutline:'#2563eb',hintBackground:'#f0f9fffa',hintText:'#0c4a6e',hintBorder:'#0284c7',pullBackground:'#0ea5e933',pullReadyBackground:'#0284c766',shadow:'#082f4955'},
  purple:{guideBackground:'#fce7f3fa',guideIcon:'#831843',guideBorder:'#c026d3',activeBackground:'#9333eaf2',activeIcon:'#fef3c7',activeBorder:'#be123c',regionBackground:'#e11d4833',regionBorder:'#a21cafb3',previewBackground:'#e879f944',previewBorder:'#a21caf',railBackground:'#f43f5e22',railActiveBackground:'#c026d388',railBorder:'#9d174dcc',ghostBackground:'#fce7f3ef',ghostIcon:'#86198f',ghostOutline:'#e11d48',hintBackground:'#fdf2f8fa',hintText:'#701a75',hintBorder:'#c026d3',pullBackground:'#d946ef33',pullReadyBackground:'#a21caf66',shadow:'#701a7555'},
};

async function createFixtures(temporary){
  for(const colors of Object.values(palettes))assert.deepEqual(Object.keys(colors).sort(),[...fields].sort(),'Fixture must cover current schema');
  const {createServer}=await import('vite');
  const vite=await createServer({root,configFile:path.join(root,'vite.config.ts'),logLevel:'error',server:{middlewareMode:true,hmr:false,ws:false,watch:null},optimizeDeps:{noDiscovery:true,include:[],entries:[]},appType:'custom'});
  const ssr={};const fixtures=[];
  try{
    const preferences=await vite.ssrLoadModule('/src/features/theme/themePreferences.ts');
    const appearance=await vite.ssrLoadModule('/src/features/theme/dockingAppearance.ts');
    const settings=await vite.ssrLoadModule('/src/features/theme/DockingColorSettings.tsx');
    const React=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
    for(const [name,colors] of Object.entries(palettes)){
      const theme=preferences.normalizeTheme({...preferences.defaultTheme,base:'white',dockingProfiles:{white:colors}});
      assert.deepEqual(appearance.dockingColors(theme),colors);
      const tokens=appearance.dockingTokens(theme);for(const key of fields)assert.equal(tokens[variable(key)],colors[key]);
      const markup=renderToStaticMarkup(React.createElement(settings.default,{preferences:theme,onChange:()=>{}}));
      const count=type=>(markup.match(new RegExp('type="'+type+'"','g'))||[]).length;
      const expectedOpacity=fields.filter(key=>schema[key].alpha).length;
      assert.equal(count('color'),fields.length);assert.equal(count('text'),fields.length);assert.equal(count('range'),expectedOpacity);
      ssr[name]={colorInputs:count('color'),textInputs:count('text'),opacityInputs:count('range'),expectedOpacity,tokens};
      fixtures.push({name,colors,tokens});
      await fs.writeFile(path.join(output,'settings-'+name+'.html'),'<!doctype html><meta charset="utf-8">'+markup);
    }
  }finally{await vite.close();}
  const fixtureFile=path.join(temporary,'fixtures.json');await fs.writeFile(fixtureFile,JSON.stringify({fixtures,ssr},null,2));return fixtureFile;
}

async function electronWorker(fixtureFile){
  const {app,BrowserWindow}=require('electron');
  const temporary=path.dirname(fixtureFile);require('node:fs').mkdirSync(path.join(temporary,'user-data'),{recursive:true});
  app.setPath('userData',path.join(temporary,'user-data'));app.disableHardwareAcceleration();
  const fixture=JSON.parse(await fs.readFile(fixtureFile,'utf8'));
  const windows=[];const result={method:'Hidden isolated Electron windows; actual product CSS/preload, computed styles and screenshots; no input or activation of user windows.',checkedAt:new Date().toISOString(),ssr:fixture.ssr,native:[],rail:[]};
  try{
    await app.whenReady();
    const native=new BrowserWindow({show:false,skipTaskbar:true,focusable:false,width:860,height:540,webPreferences:{preload:path.join(root,'desktop/dock-overlay.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,offscreen:true}});windows.push(native);
    const failures=[];native.webContents.on('preload-error',(_event,_file,error)=>failures.push(error.message));
    await native.loadFile(path.join(root,'desktop/dock-overlay.html'));
    const panelFile=path.join(temporary,'rail-fixture.html');
    const styles=['desktop/dock-appearance.css','src/features/workspace/panel-icon-rail.css','src/features/workspace/rail-edge-handle.css'].map(file=>`<link rel="stylesheet" href="${pathToFileURL(path.join(root,file)).href}">`).join('');
    await fs.writeFile(panelFile,`<!doctype html><html class="hive-desktop"><meta charset="utf-8">${styles}<style>html,body{margin:0;width:100%;height:100%;background:#f4f7fa;font:14px sans-serif}.label{position:absolute;color:#111827;z-index:12000}.rail-receive-zone{width:54px;height:300px;top:70px}.rail-pull-preview{width:220px;height:120px}.nearby-panel-rail{position:absolute;top:70px;height:300px}</style><body>
      <span class="label" style="left:30px;top:25px">upper / lower receiver</span>
      <div id="receive-upper" class="rail-receive-zone" data-active="upper" style="left:30px"></div><div id="receive-lower" class="rail-receive-zone" data-active="lower" style="left:100px"></div>
      <nav id="own-upper" class="nearby-panel-rail edge-left" data-rail-drop="upper" style="left:180px"></nav><nav id="own-lower" class="nearby-panel-rail edge-right" data-rail-drop="lower" style="left:235px"></nav>
      <span class="label" style="left:330px;top:25px">drag ghost / progress outline</span>
      <div id="ghost" class="rail-drag-ghost" style="left:390px;top:110px;width:52px;height:52px"><b>↗</b><svg class="rail-hold-outline" viewBox="0 0 40 40"><rect id="ghost-outline" x="3" y="3" width="34" height="34" rx="17"></rect></svg></div>
      <div id="hint" class="rail-dock-preview" style="left:475px;top:90px">松手创建分区</div>
      <div id="pull" class="rail-pull-preview" style="left:330px;top:210px"><span>拉出分区预览</span></div>
      <div id="pull-ready" class="rail-pull-preview ready" style="left:575px;top:210px"><span>可提交分区预览</span></div>
      <div id="region" class="dock-guide-region" style="left:330px;top:385px;width:465px;height:70px"></div>
    </body></html>`);
    const rail=new BrowserWindow({show:false,skipTaskbar:true,focusable:false,width:860,height:540,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,offscreen:true}});windows.push(rail);await rail.loadFile(panelFile);
    const {dockFeedback}=require('../desktop/windowPolicy.cjs');
    const normal={x:480,y:90,width:52,height:52},ready={x:550,y:90,width:52,height:52};
    for(const item of fixture.fixtures){
      const payload=dockFeedback({guides:[{key:'panel:sample:left',label:'内侧左分栏',button:normal},{key:'panel:sample:right',label:'内侧右分栏',button:ready},{key:'workspace:top',label:'外侧新栏',button:{x:620,y:90,width:52,height:52}},{key:'panel:sample:center',label:'合并标签',button:{x:690,y:90,width:52,height:52}}],ready:{preview:{x:120,y:80,width:300,height:330},button:ready},rail:{edge:'left',rect:{x:30,y:80,width:54,height:330}},colors:item.colors});
      assert.deepEqual(payload.colors,item.colors);native.webContents.send('hive:dock-overlay-data',{...payload,icons:dockIconPayload()});
      const nativeComputed=await native.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const start=performance.now();function check(){const color=document.documentElement.style.getPropertyValue('--hive-dock-guide-background');if(color!==${JSON.stringify(item.colors.guideBackground)}){if(performance.now()-start>5000)return reject(new Error('Native color IPC timeout'));return requestAnimationFrame(check);}requestAnimationFrame(()=>{function style(selector){const value=getComputedStyle(document.querySelector(selector));return {background:value.backgroundColor,color:value.color,border:value.borderTopColor,shadow:value.boxShadow};}function canonical(value){const probe=document.createElement('span');probe.style.color=value;document.body.append(probe);const answer=getComputedStyle(probe).color;probe.remove();return answer;}resolve({normal:style('.dock-guide.inner-guide:not(.ready):not(.stack-guide)'),ready:style('.dock-guide.ready'),outer:style('.outer-guide'),stack:style('.stack-guide'),preview:style('.dock-placement-preview'),rail:style('.dock-native-rail-preview'),expected:Object.fromEntries(Object.entries(${JSON.stringify(item.colors)}).map(([key,value])=>[key,canonical(value)]))});});}check();})`);
      const e=nativeComputed.expected;
      const nativeChecks=[];
      for(const key of ['normal','outer','stack'])for(const [property,token] of [['background','guideBackground'],['color','guideIcon'],['border','guideBorder']])nativeChecks.push({name:key+'.'+property,actual:nativeComputed[key][property],expected:e[token]});
      for(const [key,property,token] of [['ready','background','activeBackground'],['ready','color','activeIcon'],['ready','border','activeBorder'],['preview','background','previewBackground'],['preview','border','previewBorder'],['rail','background','railActiveBackground'],['rail','border','railBorder']])nativeChecks.push({name:key+'.'+property,actual:nativeComputed[key][property],expected:e[token]});
      for(const key of ['normal','preview'])nativeChecks.push({name:key+'.shadow includes custom color',actual:nativeComputed[key].shadow.includes(e.shadow),expected:true});
      result.native.push({palette:item.name,assertions:checked(nativeChecks),computed:nativeComputed});
      const picture=await native.webContents.capturePage();assert.ok(!picture.isEmpty());await fs.writeFile(path.join(output,'native-'+item.name+'.png'),picture.toPNG());
      const rootVariables={...item.tokens,'--ui-scale':'1','--text-scale':'1','--hive-panel-bg':'#f1f5f9','--hive-surface-border':'#64748b','--hive-left-rail-bg':'#e2e8f0','--hive-right-rail-bg':'#e2e8f0'};
      const railComputed=await rail.webContents.executeJavaScript(`new Promise(resolve=>{for(const [key,value] of Object.entries(${JSON.stringify(rootVariables)}))document.documentElement.style.setProperty(key,value);requestAnimationFrame(()=>{function style(selector){const value=getComputedStyle(document.querySelector(selector));return {background:value.backgroundColor,image:value.backgroundImage,color:value.color,border:value.borderTopColor,stroke:value.stroke,shadow:value.boxShadow};}function canonical(value){const probe=document.createElement('span');probe.style.color=value;document.body.append(probe);const answer=getComputedStyle(probe).color;probe.remove();return answer;}function gradient(lower){const probe=document.createElement('div');probe.style.backgroundImage=lower?'linear-gradient(to bottom,transparent 0%,transparent 50%,var(--hive-dock-rail-active-background) 50%)':'linear-gradient(to bottom,var(--hive-dock-rail-active-background) 0%,var(--hive-dock-rail-active-background) 50%,transparent 50%)';document.body.append(probe);const answer=getComputedStyle(probe).backgroundImage;probe.remove();return answer;}resolve({upper:style('#receive-upper'),lower:style('#receive-lower'),ownUpper:style('#own-upper'),ownLower:style('#own-lower'),ghost:style('#ghost'),outline:style('#ghost-outline'),hint:style('#hint'),pull:style('#pull'),pullReady:style('#pull-ready'),pullLabel:style('#pull span'),region:style('#region'),expected:Object.fromEntries(Object.entries(${JSON.stringify(item.colors)}).map(([key,value])=>[key,canonical(value)])),upperGradient:gradient(false),lowerGradient:gradient(true)});});})`);
      const re=railComputed.expected;
      const railChecks=[];
      for(const key of ['upper','lower'])for(const [property,token] of [['background','railBackground'],['border','railBorder']])railChecks.push({name:key+'.'+property,actual:railComputed[key][property],expected:re[token]});
      for(const [key,gradient] of [['upper','upperGradient'],['lower','lowerGradient'],['ownUpper','upperGradient'],['ownLower','lowerGradient']])railChecks.push({name:key+'.image',actual:railComputed[key].image,expected:railComputed[gradient]});
      railChecks.push({name:'upper/lower orientation differs',actual:railComputed.upper.image!==railComputed.lower.image,expected:true});
      for(const [key,property,token] of [['ghost','background','ghostBackground'],['ghost','color','ghostIcon'],['outline','stroke','ghostOutline'],['hint','background','hintBackground'],['hint','color','hintText'],['hint','border','hintBorder'],['pull','background','pullBackground'],['pullReady','background','pullReadyBackground'],['pull','border','previewBorder'],['pullReady','border','previewBorder'],['pullLabel','background','hintBackground'],['pullLabel','color','hintText'],['region','background','regionBackground'],['region','border','regionBorder']])railChecks.push({name:key+'.'+property,actual:railComputed[key][property],expected:re[token]});
      for(const key of ['ghost','hint'])railChecks.push({name:key+'.shadow includes custom color',actual:railComputed[key].shadow.includes(re.shadow),expected:true});
      result.rail.push({palette:item.name,assertions:checked(railChecks),computed:railComputed});
      const railPicture=await rail.webContents.capturePage();assert.ok(!railPicture.isEmpty());await fs.writeFile(path.join(output,'rail-'+item.name+'.png'),railPicture.toPNG());
    }
    assert.deepEqual(failures,[]);assert.notEqual(result.native[0].computed.normal.background,result.native[1].computed.normal.background);assert.notEqual(result.rail[0].computed.ghost.background,result.rail[1].computed.ghost.background);
    result.secondPaletteRefreshVerified=true;result.preloadErrors=failures;result.passed=true;await fs.writeFile(path.join(output,'render-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,fields:fields.length,palettes:fixture.fixtures.length,nativePasses:result.native.length,railPasses:result.rail.length,secondPaletteRefreshVerified:true}));
    for(const window of windows)if(!window.isDestroyed())window.destroy();app.exit(0);
  }catch(error){
    await fs.writeFile(path.join(output,'render-validation-error.json'),JSON.stringify({message:error.message,stack:error.stack,partial:result},null,2));console.error(error.stack);for(const window of windows)if(!window.isDestroyed())window.destroy();app.exit(1);
  }
}

if(process.argv.includes('--verify-docking-worker'))void electronWorker(process.argv[process.argv.indexOf('--verify-docking-worker')+1]).catch(error=>{console.error(error.stack);require('electron').app.exit(1);});
else{
  await fs.mkdir(output,{recursive:true});const temporary=await fs.mkdtemp(path.join(output,'.docking-render-'));
  try{
    const fixtureFile=await createFixtures(temporary),electron=(await import('electron')).default;
    const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
    const child=spawn(electron,[fileURLToPath(import.meta.url),'--verify-docking-worker',fixtureFile],{cwd:root,windowsHide:true,env:environment,stdio:['ignore','pipe','pipe']});let log='';
    child.stdout.on('data',chunk=>{log+=chunk;process.stdout.write(chunk);});child.stderr.on('data',chunk=>{log+=chunk;process.stderr.write(chunk);});
    const status=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('Hidden Electron render verification timed out'));},60000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',(code,signal)=>{clearTimeout(timer);resolve({code,signal});});});
    await fs.writeFile(path.join(output,'render-electron.log'),log);assert.equal(status.code,0,'Electron verification failed; see render-validation-error.json');
  }finally{
    const resolved=path.resolve(temporary);assert.equal(path.dirname(resolved),path.resolve(output));assert.ok(path.basename(resolved).startsWith('.docking-render-'));await fs.rm(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
}
