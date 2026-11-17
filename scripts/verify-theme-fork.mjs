import {fork} from 'node:child_process';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url));
const executable=process.argv[2]?path.resolve(process.argv[2]):process.execPath;
const server=process.argv[3]?path.resolve(process.argv[3]):path.join(root,'server/index.mjs');
const reportDirectory=process.argv[4]?path.resolve(process.argv[4]):path.join(root,'delivery/fork-0.1.3-20261117');
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'hive-fork-verification-'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const sourceFiles=['olive-gold','mediterranean-blue','claude-olive-gold','claude-mediterranean-blue'].flatMap(id=>['template.json','colors.json'].map(name=>path.join(root,'templates',id,name)));
const sourceHashes=new Map(await Promise.all(sourceFiles.map(async file=>[file,sha(await fs.readFile(file))])));
let child;
try{
  child=fork(server,['--production'],{cwd:root,execPath:executable,silent:true,windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',HIVE_PORT:'0',HIVE_API_KEY:'',HIVE_STATE_DIR:path.join(temporary,'state'),HIVE_DOCUMENTS:path.join(temporary,'documents'),HIVE_TEMPLATES_DIR:path.join(temporary,'templates'),HIVE_TEMPLATES_SOURCE:''}});
  const port=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Test backend startup timeout')),10000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);reject(new Error('Test backend exited '+code));});
    child.on('message',message=>{if(message?.type==='hive-ready'){clearTimeout(timer);resolve(message.port);}});
  });
  const origin='http://127.0.0.1:'+port;
  async function json(route,options){const response=await fetch(origin+route,options);assert.equal(response.ok,true,route+' HTTP '+response.status);return response.json();}
  const catalog=await json('/api/templates');assert.deepEqual(catalog.warnings,[]);
  const ids=catalog.templates.map(template=>template.id).sort();assert.deepEqual(ids,[...new Set(sourceFiles.map(file=>path.basename(path.dirname(file))))].sort());
  for(const id of ids){const item=await json('/api/templates/'+id);assert.match(item.revision,/^[a-f0-9]{64}$/);assert.match(item.defaultsRevision,/^[a-f0-9]{64}$/);assert.ok(item.defaults.surfaceColors);}
  const initial=await json('/api/templates/mediterranean-blue');assert.deepEqual(initial.template.bases,['black','white']);
  const dockingProfiles={white:{guideIcon:'#075985',guideBackground:'#edf5fffa',railActiveBackground:'#0284c788',shadow:'#082f4955'}};
  const manualText={uiText:'#263c8a',mutedText:'#67548a',documentText:'#16543b',ribbonTitleText:'#9b2539',ribbonContentText:'#3b477a'};
  const surfaceColors={...initial.colors.surfaceColors,white:{...initial.colors.surfaceColors.white,...manualText}};
  const saved=await json('/api/templates/mediterranean-blue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:initial.revision,colors:{...initial.colors,customBase:'#123456',dockingProfiles,surfaceColors}})});
  assert.equal(saved.defaults.customBase,'#123456');
  assert.deepEqual(saved.colors.dockingProfiles,dockingProfiles);assert.deepEqual(saved.defaults.dockingProfiles,dockingProfiles);
  for(const [key,value] of Object.entries(manualText)){assert.equal(saved.colors.surfaceColors.white[key],value);assert.equal(saved.defaults.surfaceColors.white[key],value);}
  const target=path.resolve(saved.directory);assert.ok(target.startsWith(path.resolve(temporary)+path.sep));
  const backup=JSON.parse(await fs.readFile(path.join(target,'colors.before-save.json'),'utf8'));assert.equal(backup.customBase,initial.colors.customBase);
  await fs.unlink(path.join(target,'colors.json'));const restored=await json('/api/templates/mediterranean-blue');assert.equal(restored.colors.customBase,'#123456');assert.equal(restored.defaults.customBase,'#123456');
  assert.deepEqual(restored.colors.dockingProfiles,dockingProfiles);assert.deepEqual(restored.defaults.dockingProfiles,dockingProfiles);
  for(const [key,value] of Object.entries(manualText)){assert.equal(restored.colors.surfaceColors.white[key],value);assert.equal(restored.defaults.surfaceColors.white[key],value);}
  for(const [file,hash] of sourceHashes)assert.equal(sha(await fs.readFile(file)),hash,'Source template changed: '+file);
  const exited=new Promise(resolve=>child.once('exit',resolve));child.send({type:'hive-shutdown'});
  await Promise.race([exited,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Graceful shutdown timeout')),5000);timer.unref();})]);assert.equal(child.exitCode,0);
  const result={checkedAt:new Date().toISOString(),executable,server,templates:ids,blueBases:initial.template.bases,explicitSaveBackup:true,dockingProfilesRoundTrip:true,manualTextRoundTrip:true,missingCopyReconstructed:true,sourceTemplatesUnchanged:true,gracefulShutdown:true};
  await fs.mkdir(reportDirectory,{recursive:true});await fs.writeFile(path.join(reportDirectory,'package-theme-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{
  if(child&&child.exitCode===null&&child.signalCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');await exited;}
  assert.equal(path.dirname(temporary),path.resolve(os.tmpdir()));assert.ok(path.basename(temporary).startsWith('hive-fork-verification-'));await fs.rm(temporary,{recursive:true,force:true});
}
