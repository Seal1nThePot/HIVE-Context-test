import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
let temp,child,base,workspace;
const png=Buffer.from([137,80,78,71,13,10,26,10,0,1,2]);
const post=(name,body,id=workspace.id)=>fetch(base+'/api/import?name='+encodeURIComponent(name),{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Hive-Workspace':id},body});
beforeAll(async()=>{
 temp=await fs.mkdtemp(path.join(os.tmpdir(),'hive-import-test-'));
 const reserve=createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));base='http://127.0.0.1:'+port;
 child=spawn(process.execPath,['server/index.mjs','--production'],{cwd:process.cwd(),windowsHide:true,env:{...process.env,HIVE_PORT:String(port),HIVE_DOCUMENTS:path.join(temp,'docs'),HIVE_STATE_DIR:path.join(temp,'state')}});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('startup timeout')),10000);child.stdout.on('data',data=>{if(data.toString().includes('HIVE ready')){clearTimeout(timer);resolve();}});child.once('exit',code=>reject(new Error('exit '+code)));});
 workspace=await(await fetch(base+'/api/workspace')).json();
},15000);
afterAll(async()=>{if(child){child.kill();if(child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));}if(temp)await fs.rm(temp,{recursive:true,force:true});});
describe('external import HTTP',()=>{
 it('preserves bytes and creates distinct copies for concurrent same-name Markdown and mixed images',async()=>{
  const text=Buffer.from('\ufeff正文\r\n');const results=await Promise.all([post('稿.md',text),post('稿.md',text),post('图.png',png)]);expect(results.every(r=>r.ok)).toBe(true);
  const data=await Promise.all(results.map(r=>r.json()));expect(new Set(data.map(x=>x.path)).size).toBe(3);
  for(const item of data.slice(0,2))expect(await fs.readFile(path.join(temp,'docs',item.path))).toEqual(text);
  expect((await(await fetch(base+'/api/tree',{headers:{'X-Hive-Workspace':workspace.id}})).json()).entries.filter(x=>x.name.startsWith('稿')).length).toBe(2);
  expect((await(await fetch(base+'/api/import',{headers:{'X-Hive-Workspace':workspace.id}})).json()).map(x=>x.path)).toContain(data[2].path);
  const image=await fetch(base+'/api/import/image?path='+encodeURIComponent(data[2].path),{headers:{'X-Hive-Workspace':workspace.id}});expect(image.headers.get('content-type')).toContain('image/png');expect(Buffer.from(await image.arrayBuffer())).toEqual(png);
 });
 it('sanitizes names and rejects unsupported, malformed, oversized and traversing requests',async()=>{
  const safe=await post('../bad:name.md',Buffer.from('safe'));expect(safe.ok).toBe(true);expect((await safe.json()).path).toBe('badname.md');
  expect((await post('a.txt',Buffer.from('text'))).status).toBe(400);
  expect((await post('a.png',Buffer.from('not a png'))).status).toBe(400);
  expect((await post('a.jpg',png)).status).toBe(400);
  expect((await post('a.md',Buffer.from([0xff]))).status).toBe(400);
  expect((await post('large.md',Buffer.alloc(2000001))).status).toBe(400);
  expect((await fetch(base+'/api/import/image?path='+encodeURIComponent('导入的图片/../badname.md'),{headers:{'X-Hive-Workspace':workspace.id}})).status).toBe(400);
 });
 it('returns saved document references through the workspace-scoped API',async()=>{
  await fs.writeFile(path.join(temp,'docs','引用.md'),'![图](导入的图片/%E5%9B%BE.png)');
  const response=await fetch(base+'/api/import/references?path='+encodeURIComponent('导入的图片/图.png'),{headers:{'X-Hive-Workspace':workspace.id}});
  expect(response.ok).toBe(true);expect((await response.json()).matches).toContainEqual({path:'引用.md',lines:[1]});
 });
 it('serves direct image tabs through the scoped HTTP routes and preserves path/type boundaries',async()=>{
  const headers={'X-Hive-Workspace':workspace.id},query='?workspace='+workspace.id+'&path='+encodeURIComponent('导入的图片/图.png');
  const info=await fetch(base+'/api/image-file/info?path='+encodeURIComponent('导入的图片/图.png'),{headers});expect(info.ok).toBe(true);expect(await info.json()).toMatchObject({mime:'image/png',bytes:png.length});
  const image=await fetch(base+'/api/image-file'+query);expect(image.ok).toBe(true);expect(Buffer.from(await image.arrayBuffer())).toEqual(png);
  expect((await fetch(base+'/api/image-file?workspace=old&path='+encodeURIComponent('导入的图片/图.png'))).status).toBe(409);
  expect((await fetch(base+'/api/image-file/info?path='+encodeURIComponent('../图.png'),{headers})).status).toBe(400);
  expect((await fetch(base+'/api/image-file/info?path='+encodeURIComponent('引用.md'),{headers})).status).toBe(400);
 });
 it('rejects a stale workspace and refuses a linked image destination',async()=>{
  const other=path.join(temp,'other');await fs.mkdir(other);const switchResponse=await fetch(base+'/api/workspace',{method:'POST',headers:{'Content-Type':'application/json','X-Hive-Workspace':workspace.id},body:JSON.stringify({root:other,revision:workspace.revision})});expect(switchResponse.ok).toBe(true);
  const next=await switchResponse.json();expect((await post('stale.md',Buffer.from('old'))).status).toBe(409);expect(await fs.readdir(other)).toEqual([]);
  const outside=path.join(temp,'outside');await fs.mkdir(outside);await fs.symlink(outside,path.join(other,'导入的图片'),'junction');
  expect((await post('linked.png',png,next.id)).status).toBe(400);expect(await fs.readdir(outside)).toEqual([]);
 });
});
