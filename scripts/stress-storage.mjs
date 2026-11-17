import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fork, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {performance} from 'node:perf_hooks';
import {extractFile} from '@electron/asar';
import {fileStore} from '../server/files.mjs';
import {workspaceStore} from '../server/workspace.mjs';

// Isolated synthetic storage pressure. Run with Node; no desktop window, user
// profile, user documents, forced GC, or changes to application modules.
const script = fileURLToPath(import.meta.url), project = path.resolve(path.dirname(script), '..');
const evidence = path.resolve(process.env.HIVE_STRESS_EVIDENCE || path.join(project,'.runtime/stress'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const now = () => performance.now();
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('HIVE_') && name !== 'ELECTRON_RUN_AS_NODE'));
const scale = {regular:{documents:5000, directories:100, dependencies:0}, large:{documents:30000, directories:300, dependencies:20000}};
function latency(values) {
  const sorted = [...values].sort((a,b) => a-b), at = q => sorted[Math.min(sorted.length-1, Math.ceil(sorted.length*q)-1)];
  return {count:values.length, minMs:sorted[0], p50Ms:at(.5), p95Ms:at(.95), p99Ms:at(.99), maxMs:sorted.at(-1)};
}
async function bounded(count, width, fn) {
  let next = 0;
  await Promise.all(Array.from({length:Math.min(width,count)}, async () => {while(next<count) {const i=next++; await fn(i);}}));
}
async function timed(fn, values) {const start=now(); const value=await fn(); values.push(now()-start); return value;}
function countTree(entries) {
  let files=0, folders=0;
  function walk(items) {for(const item of items) {if(item.type==='file')files++; else {folders++;walk(item.children||[]);}}}
  walk(entries); return {files,folders};
}
function pathsIn(entries, prefix) {
  const result=[];
  function walk(items) {for(const item of items) {if(item.type==='file'&&item.path.startsWith(prefix))result.push(item.path);if(item.children)walk(item.children);}}
  walk(entries);return result;
}
function memorySample(phase) {return {time:new Date().toISOString(), phase, ...process.memoryUsage()};}
async function windowsMetrics(pid) {
  if(process.platform!=='win32')return null;
  const query=`Get-CimInstance Win32_PerfRawData_PerfProc_Process -Filter 'IDProcess = ${Number(pid)}' | Select-Object IDProcess,WorkingSetPrivate,PrivateBytes | ConvertTo-Json -Compress`;
  const encoded=Buffer.from(query,'utf16le').toString('base64');
  const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',encoded],{windowsHide:true,timeout:10000,maxBuffer:1024*1024});
  return JSON.parse(stdout||'null');
}
async function writeReport(file, data) {await fs.writeFile(file, JSON.stringify(data,null,2)+'\n');}
async function fixture(base, label) {
  const dimensions=scale[label], directory=path.join(base,label), docs=path.join(directory,'documents');
  await fs.mkdir(docs,{recursive:true}); await fs.mkdir(path.join(directory,'state'));
  await bounded(dimensions.directories,16,i=>fs.mkdir(path.join(docs,`folder-${String(i).padStart(4,'0')}`)));
  await bounded(dimensions.documents,32,i=>fs.writeFile(path.join(docs,`folder-${String(i%dimensions.directories).padStart(4,'0')}`,`doc-${i}.md`),`# Synthetic ${i}\n\nStorage pressure fixture; no user data.\n${'body '.repeat(40)}\n`));
  if(dimensions.dependencies) {
    await fs.mkdir(path.join(docs,'node_modules'));
    await bounded(100,16,i=>fs.mkdir(path.join(docs,'node_modules',`package-${i}`)));
    await bounded(dimensions.dependencies,32,i=>fs.writeFile(path.join(docs,'node_modules',`package-${i%100}`,`dependency-${i}.js`),'export const synthetic = true;\n'));
  }
  return directory;
}
async function settle(store) {await delay(180); return store.snapshot({force:true});}
async function snapshotBurst(store, width=32, force=false) {
  const samples=[], before=store.debugStats(), start=now();
  const results=await Promise.all(Array.from({length:width},()=>timed(()=>store.snapshot({force}),samples)));
  const first=results[0];
  assert(results.every(item=>item.treeVersion===first.treeVersion),'Concurrent snapshot versions differ');
  return {elapsedMs:now()-start, latency:latency(samples), treeVersion:first.treeVersion, counts:countTree(first.entries), before, after:store.debugStats()};
}
async function poll(store, treeVersion, total=1000) {
  const samples=[], before=store.debugStats(), start=now();
  for(let offset=0;offset<total;offset+=32)
    await bounded(Math.min(32,total-offset),32,async()=>{
      const item=await timed(()=>store.snapshot({knownVersion:treeVersion}),samples);
      assert.equal(item.treeVersion,treeVersion);assert(!Object.hasOwn(item,'entries'),'Unchanged poll returned a tree');
    });
  const after=store.debugStats();
  assert.equal(after.scanCount,before.scanCount,'Known-version polling rescanned');
  assert.equal(after.statCount,before.statCount,'Known-version polling performed directory stats');
  return {total, concurrency:32, elapsedMs:now()-start, latency:latency(samples), before, after};
}
async function converge(store, treeVersion) {
  const started=now(),before=store.debugStats(),sequence=[];
  let quietSince=now(),events=before.watcherEvents;
  while(now()-started<10000) {
    await delay(100);const stats=store.debugStats();
    sequence.push({time:new Date().toISOString(),elapsedMs:now()-started,scanCount:stats.scanCount,watcherEvents:stats.watcherEvents,invalidations:stats.invalidations});
    if(stats.watcherEvents!==events){events=stats.watcherEvents;quietSince=now();}
    if(now()-quietSince<1000)continue;
    const snapshot=await store.snapshot({knownVersion:treeVersion});treeVersion=snapshot.treeVersion;
    await delay(100);const settled=store.debugStats();
    sequence.push({time:new Date().toISOString(),elapsedMs:now()-started,scanCount:settled.scanCount,watcherEvents:settled.watcherEvents,invalidations:settled.invalidations,afterConvergingSnapshot:true});
    if(settled.watcherEvents===events)return {elapsedMs:now()-started,extraScans:settled.scanCount-before.scanCount,before,after:settled,sequence,treeVersion};
    events=settled.watcherEvents;quietSince=now();
  }
  const error=Error('Directory watcher did not converge within 10 seconds');error.sequence=sequence;throw error;
}
async function externalStorm(store, docs) {
  const records=[];
  for(const stage of ['create','rename','delete']) {
    const samples=[], start=now(), before=store.debugStats();
    const mutations=bounded(300,16,i=>timed(async()=>{
      const first=path.join(docs,`storm-${i}.md`),second=path.join(docs,`storm-renamed-${i}.md`);
      if(stage==='create')await fs.writeFile(first,'external synthetic');
      if(stage==='rename')await fs.rename(first,second);
      if(stage==='delete')await fs.unlink(second);
    },samples));
    const concurrent=Promise.all(Array.from({length:16},()=>store.snapshot()));
    await mutations;await concurrent;
    const tree=await settle(store), found=pathsIn(tree.entries,'storm-');
    assert.equal(found.length,stage==='delete'?0:300,`${stage} storm tree count`);
    if(stage==='rename')assert(found.every(name=>name.startsWith('storm-renamed-')));
    records.push({stage, operations:300, mutationConcurrency:16, snapshotConcurrency:16, elapsedMs:now()-start, latency:latency(samples), observedFiles:found.length, before, after:store.debugStats()});
  }
  return records;
}
async function conflictPressure(store) {
  const initial=await store.save({path:'conflict.md',text:'initial',baseline:null});
  const latencies=[];let accepted=0, conflicts=0;
  await bounded(100,32,i=>timed(async()=>{
    try {await store.save({path:'conflict.md',text:`writer-${i}`,baseline:initial.hash});accepted++;}
    catch(error) {if(error.status!==409)throw error;conflicts++;}
  },latencies));
  assert.equal(accepted,1);assert.equal(conflicts,99);
  const final=await store.read('conflict.md');assert.match(final.text,/^writer-\d+$/);
  return {requests:100, concurrency:32, accepted, conflicts, latency:latency(latencies), finalHash:final.hash};
}
async function failureRecovery(base) {
  const docs=path.join(base,'failure-documents'),state=path.join(base,'failure-state');
  await fs.mkdir(docs);await fs.mkdir(state);await fs.writeFile(path.join(docs,'recover.md'),'recover');
  const store=fileStore(docs,state), target=path.join(state,'file-times.json'), original=fs.rename;
  let injected=false,rejected=false;
  try {
    fs.rename=async function(from,to,...rest) {if(to===target&&!injected){injected=true;throw Object.assign(new Error('Synthetic metadata rename failure'),{code:'EACCES'});}return original.call(this,from,to,...rest);};
    try {await store.snapshot();}catch(error){assert.equal(error.code,'EACCES');rejected=true;}
  } finally {fs.rename=original;}
  try {
    assert(rejected,'Injected metadata failure did not reject');
    const recovered=await store.snapshot();assert.equal(countTree(recovered.entries).files,1);
    assert(JSON.parse(await fs.readFile(target,'utf8'))['recover.md']);
    return {fault:'one synthetic EACCES at metadata rename, in isolated test worker only', rejected, recovered:true, stats:store.debugStats()};
  } finally {await store.close();}
}
async function switching(base, docs) {
  const other=path.join(base,'switch-other');await fs.mkdir(other);
  const spaces=await workspaceStore(path.join(base,'switch-state'),docs);
  try {
    const old=spaces.capture();await old.files.snapshot();
    const before=old.files.debugStats();
    await spaces.update({root:other,revision:0});
    const after=old.files.debugStats();assert.equal(after.watcherCount,0);assert.equal(after.cachedEntryCount,0);assert.equal(after.active,false);
    await old.files.save({path:'captured-request.md',text:'original repository',baseline:null});
    await assert.rejects(spaces.capture().files.read('captured-request.md'),{code:'ENOENT'});
    await spaces.update({root:docs,revision:1});assert.equal(spaces.capture(),old);
    assert.equal((await old.files.read('captured-request.md')).text,'original repository');
    await spaces.close();
    return {before, after, afterClose:old.files.debugStats(), capturedRequestStayedInOriginalRepository:true};
  } finally {await spaces.close();}
}
async function storageWorker(label, base, output) {
  const dimensions=scale[label], docs=path.join(base,'documents'),state=path.join(base,'state');
  let phase='start', interval,store;
  const memory=[memorySample(phase)], started=new Date().toISOString(), result={label,dimensions,started,passed:false,method:'Source fileStore verified against packaged archive; isolated Node worker; bounded tasks; no forced GC.'};
  interval=setInterval(()=>memory.push(memorySample(phase)),100);interval.unref();
  try {
    store=fileStore(docs,state);phase='initial-scan';
    console.log(`${label}: 32 concurrent initial snapshots`);
    result.initial=await snapshotBurst(store);
    assert.equal(result.initial.counts.files,dimensions.documents);assert.equal(result.initial.counts.folders,dimensions.directories);
    assert.equal(result.initial.after.scanCount-result.initial.before.scanCount,1);
    assert.equal(result.initial.after.statCount,dimensions.documents+dimensions.directories,'Unexpected traversal into dependencies');
    assert(result.initial.after.maxPendingStats<=16);
    if(label==='large')assert.equal(result.initial.after.cachedEntryCount,0,'Oversized tree retained');
    else assert.equal(result.initial.after.cachedEntryCount,dimensions.documents+dimensions.directories);
    phase='watcher-convergence';result.convergence=await converge(store,result.initial.treeVersion);
    phase='unchanged-polling';result.polling=await poll(store,result.convergence.treeVersion);
    if(label==='regular') {
      phase='external-storm';console.log('regular: 900 external changes and concurrent snapshots');
      result.externalStorm=await externalStorm(store,docs);
      phase='save-conflicts';result.conflicts=await conflictPressure(store);
      phase='failure-recovery';result.failureRecovery=await failureRecovery(base);
      phase='close-before-switch';await store.close();store=null;
      phase='workspace-switch';result.switching=await switching(base,docs);
    }
    if(store) {await store.close();result.afterClose=store.debugStats();store=null;}
    phase='idle-after-close';memory.push(memorySample(phase));
    console.log(`${label}: closed indexes; measuring 10s idle without forced GC`);
    await delay(10000);result.passed=true;
  } catch(error) {result.error=error.stack;console.error(error.stack);process.exitCode=1;}
  finally {
    if(store)await store.close();clearInterval(interval);memory.push(memorySample('finished'));
    result.finished=new Date().toISOString();result.memory={samples:memory, peakRss:Math.max(...memory.map(row=>row.rss)),peakHeapUsed:Math.max(...memory.map(row=>row.heapUsed)),initial:memory[0],afterIdle:memory.at(-1),forcedGc:false};
    await writeReport(output,result);
  }
}
async function httpWorker(base, output) {
  const result={label:'packaged-http',passed:false,started:new Date().toISOString()},dimensions=scale.regular;
  const archive=path.join(project,'release/win-unpacked/resources/app.asar'),exe=path.join(project,'release/win-unpacked/HIVE markdown editor.exe');
  let server,serverLog='',sampler,busy=false;
  const osSamples=[],stdout=[];
  try {
    const docs=path.join(base,'documents'),state=path.join(base,'http-state');
    server=fork(path.join(archive,'server/index.mjs'),['--production'],{execPath:exe,cwd:project,silent:true,windowsHide:true,env:{...cleanEnv(),ELECTRON_RUN_AS_NODE:'1',HIVE_PORT:'0',HIVE_DOCUMENTS:docs,HIVE_STATE_DIR:state,HIVE_API_KEY:''}});
    server.stdout.on('data',data=>{serverLog+=data;});server.stderr.on('data',data=>{serverLog+=data;});
    const port=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Packaged backend startup timeout')),30000);
      server.once('error',reject);server.once('exit',code=>reject(Error(`Packaged backend exited ${code}`)));
      server.on('message',message=>{if(message?.type==='hive-ready'){clearTimeout(timer);resolve(message.port);}});
    });
    result.backendPid=server.pid;result.port=port;result.dimensions=dimensions;
    const sample=async()=>{if(busy)return;busy=true;try{osSamples.push({time:new Date().toISOString(),...await windowsMetrics(server.pid)});}catch(error){stdout.push(`OS counter: ${error.message}`);}finally{busy=false;}};
    await sample();sampler=setInterval(()=>void sample(),2000);sampler.unref();
    const request=async(route,body,workspace)=>{
      const response=await fetch(`http://127.0.0.1:${port}${route}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(workspace?{'X-Hive-Workspace':workspace}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
      const text=await response.text();return {status:response.status,bytes:Buffer.byteLength(text),body:JSON.parse(text)};
    };
    const health=await request('/api/health');assert.equal(health.status,200);assert(health.body.project.includes('app.asar'));result.health=health.body;
    const workspace=(await request('/api/workspace')).body,latencies=[];
    const first=await request('/api/workspace/sync',{paths:['folder-0000/doc-0.md']},workspace.id);assert.equal(first.status,200);
    assert.equal(countTree(first.body.entries).files,5003); // initial 5000 + stress conflict/captured files + initial scratch
    const treeVersion=first.body.treeVersion, baseline=first.body.files[0].hash;
    let maxBytes=0,minBytes=Infinity;
    const start=now();
    await bounded(1000,32,async()=>{
      const item=await timed(()=>request('/api/workspace/sync',{paths:['folder-0000/doc-0.md'],baselines:{'folder-0000/doc-0.md':baseline},treeVersion},workspace.id),latencies);
      assert.equal(item.status,200);assert.equal(item.body.treeVersion,treeVersion);assert(!Object.hasOwn(item.body,'entries'));assert.equal(item.body.files[0].unchanged,true);
      maxBytes=Math.max(maxBytes,item.bytes);minBytes=Math.min(minBytes,item.bytes);
    });
    result.polling={requests:1000,concurrency:32,elapsedMs:now()-start,latency:latency(latencies),firstBytes:first.bytes,unchangedMinBytes:minBytes,unchangedMaxBytes:maxBytes};
    const file=(await request('/api/file?path=folder-0000%2Fdoc-0.md',undefined,workspace.id)).body;
    let accepted=0,conflicts=0;const saveLatencies=[];
    await bounded(64,32,i=>timed(async()=>{const item=await request('/api/file',{path:file.path,text:`http-${i}`,baseline:file.hash},workspace.id);if(item.status===200)accepted++;else{assert.equal(item.status,409);conflicts++;}},saveLatencies));
    assert.equal(accepted,1);assert.equal(conflicts,63);result.conflicts={requests:64,concurrency:32,accepted,conflicts,latency:latency(saveLatencies)};
    const other=path.join(base,'http-other');await fs.mkdir(other);
    const changed=await request('/api/workspace',{root:other,revision:workspace.revision},workspace.id);assert.equal(changed.status,200);
    const stale=await request('/api/workspace/sync',{paths:[],treeVersion},workspace.id);assert.equal(stale.status,409);result.staleWorkspaceRejected=true;
    await sample();console.log('packaged-http: 1000 polls and 64 same-baseline saves complete; 10s idle');
    await delay(10000);await sample();result.passed=true;
  }catch(error){result.error=error.stack;console.error(error.stack);process.exitCode=1;}
  finally{
    clearInterval(sampler);result.osSamples=osSamples;result.osCounterNotes=stdout;result.finished=new Date().toISOString();result.serverLog=serverLog;
    if(server&&server.exitCode===null){server.send({type:'hive-shutdown'});await Promise.race([new Promise(resolve=>server.once('exit',resolve)),delay(5000)]);if(server.exitCode===null)server.kill();}
    await writeReport(output,result);
  }
}
async function runWorker(label,base,runDir) {
  const output=path.join(runDir,`${label}.json`),log=path.join(runDir,`${label}.log`),args=['--worker',label,base,output];
  const child=fork(script,args,{cwd:project,silent:true,windowsHide:true,env:cleanEnv()});
  let contents='',timer,busy=false;const osSamples=[];
  child.stdout.on('data',data=>{contents+=data;process.stdout.write(data);});child.stderr.on('data',data=>{contents+=data;process.stderr.write(data);});
  const sample=async()=>{if(busy)return;busy=true;try{const data=await windowsMetrics(child.pid);if(data)osSamples.push({time:new Date().toISOString(),...data});}catch(error){contents+=`OS counter: ${error.message}\n`;}finally{busy=false;}};
  if(label!=='http'){await sample();timer=setInterval(()=>void sample(),2000);timer.unref();}
  try {
    const code=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{child.kill();reject(Error(`${label}: 240 second worker timeout`));},240000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timeout);resolve(code);});});
    const report=JSON.parse(await fs.readFile(output,'utf8'));report.osSamples=osSamples.length?osSamples:report.osSamples;await writeReport(output,report);
    assert.equal(code,0,`${label} worker failed; see ${output}`);assert.equal(report.passed,true);return report;
  }finally{clearInterval(timer);await fs.writeFile(log,contents);if(child.exitCode===null)child.kill();}
}
async function main() {
  await fs.mkdir(evidence,{recursive:true});const runDir=await fs.mkdtemp(path.join(evidence,'storage-')),fixtureRoot=path.join(runDir,'.synthetic-fixtures');
  await fs.mkdir(fixtureRoot);
  const report={started:new Date().toISOString(),node:process.version,platform:process.platform,scale,runDir,passed:false,forcedGc:false};
  let passed=false;
  try {
    const archive=path.join(project,'release/win-unpacked/resources/app.asar'),matches=[];
    for(const name of (await fs.readdir(path.join(project,'server'))).filter(name=>name.endsWith('.mjs')&&!name.includes('.test.'))) {
      const relative=`server/${name}`,current=hash(await fs.readFile(path.join(project,relative))),packaged=hash(extractFile(archive,relative));
      assert.equal(current,packaged,`Source/package mismatch: ${relative}`);matches.push({path:relative,sha256:current});
    }
    report.runtimeHashes=matches;report.archiveSha256=hash(await fs.readFile(archive));
    console.log(`Storage stress evidence: ${runDir}`);
    console.log('Generating regular fixture: 5000 Markdown files / 100 folders');
    const regular=await fixture(fixtureRoot,'regular');
    report.regular=await runWorker('regular',regular,runDir);
    console.log('Generating oversized fixture: 30000 Markdown files / 300 folders + 20000 dependency files');
    const large=await fixture(fixtureRoot,'large');
    report.large=await runWorker('large',large,runDir);
    report.http=await runWorker('http',regular,runDir);
    report.passed=true;passed=true;
  }catch(error){report.error=error.stack;console.error(error.stack);process.exitCode=1;}
  finally{
    report.finished=new Date().toISOString();report.fixtureCleanup={resolved:path.resolve(fixtureRoot),parent:path.resolve(runDir),removed:false};
    // Cleanup is confined to a freshly created absolute child of this run. On
    // substantive failure fixtures remain available for exact reproduction.
    assert.equal(path.dirname(path.resolve(fixtureRoot)),path.resolve(runDir));assert.equal(path.basename(fixtureRoot),'.synthetic-fixtures');
    if(passed){await fs.rm(fixtureRoot,{recursive:true,force:true,maxRetries:10,retryDelay:100});report.fixtureCleanup.removed=true;}
    await writeReport(path.join(runDir,'summary.json'),report);console.log(JSON.stringify({passed:report.passed,summary:path.join(runDir,'summary.json'),fixturesPreserved:!passed}));
  }
}
if(process.argv[2]==='--worker') {
  const [, , ,label,base,output]=process.argv;
  if(label==='http')await httpWorker(base,output);else await storageWorker(label,base,output);
}else await main();
