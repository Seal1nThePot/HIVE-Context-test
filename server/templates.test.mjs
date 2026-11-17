import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {EventEmitter} from 'node:events';
import {fileURLToPath} from 'node:url';
import {templateStore,validateTemplateColors} from './templates.mjs';

const sourceFixture=fileURLToPath(new URL('../templates/olive-gold',import.meta.url));
let directory,temporary,bundled,store,fixture,initialRevision;
beforeEach(async()=>{temporary=await fs.mkdtemp(path.join(os.tmpdir(),'hive-template-files-'));directory=path.join(temporary,'runtime');bundled=path.join(temporary,'bundled');await fs.cp(sourceFixture,path.join(bundled,'olive-gold'),{recursive:true});store=await templateStore(directory,bundled);fixture=JSON.parse(await fs.readFile(path.join(bundled,'olive-gold','colors.json'),'utf8'));initialRevision=(await store.read('olive-gold')).revision;});
afterEach(async()=>{store?.close();if(temporary&&path.resolve(temporary).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temporary).startsWith('hive-template-files-'))await fs.rm(temporary,{recursive:true,force:true});});

describe('local template folders',()=>{
  it('seeds metadata without replacing an existing template or user palette',async()=>{
    const original=await store.read('olive-gold');expect(original.revision).toMatch(/^[a-f0-9]{64}$/);
    fixture.colors.accent='#bfb178';fixture.colorProfiles.black.accent='#bfb178';
    const saved=await store.save('olive-gold',{revision:initialRevision,colors:fixture});
    const meta=path.join(directory,'olive-gold','template.json');const data=JSON.parse(await fs.readFile(meta,'utf8'));data.name='我的青苔';await fs.writeFile(meta,JSON.stringify(data));
    const restarted=await templateStore(directory,bundled),read=await restarted.read('olive-gold');
    expect(read.revision).toBe(saved.revision);expect(read.colors.colors.accent).toBe('#bfb178');expect(read.template.name).toBe('我的青苔');
  });
  it('stores only theme fields, including the complete default scheme',async()=>{
    const saved=await store.save('olive-gold',{revision:initialRevision,colors:{...fixture,defaultScheme:fixture,apiKey:'never-store-this',documents:['private manuscript']}});
    expect(saved.colors.defaultScheme.surfaceColors.gray.document).toBe(fixture.surfaceColors.gray.document);
    const text=await fs.readFile(path.join(directory,'olive-gold','colors.json'),'utf8');expect(text).not.toContain('never-store-this');expect(text).not.toContain('private manuscript');
    expect(saved.revision).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rejects stale writes and serializes simultaneous writes against one revision',async()=>{
    const first=await store.save('olive-gold',{revision:initialRevision,colors:fixture});
    const update={...fixture,colors:{...fixture.colors,accent:'#112233'}};
    const results=await Promise.allSettled([store.save('olive-gold',{revision:first.revision,colors:update}),store.save('olive-gold',{revision:first.revision,colors:fixture})]);
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect(results.find(result=>result.status==='rejected').reason.status).toBe(409);
    expect((await store.read('olive-gold')).colors.colors.accent).toBe('#112233');
    expect((await fs.readdir(path.join(directory,'olive-gold'))).some(name=>name.endsWith('.tmp'))).toBe(false);
  });
  it('detects external edits and leaves them intact',async()=>{
    const first=await store.save('olive-gold',{revision:initialRevision,colors:fixture}),file=path.join(directory,'olive-gold','colors.json');
    const external={...fixture,customBase:'#345678'};await fs.writeFile(file,JSON.stringify(external));
    await expect(store.save('olive-gold',{revision:first.revision,colors:fixture})).rejects.toMatchObject({status:409});
    expect(JSON.parse(await fs.readFile(file,'utf8')).customBase).toBe('#345678');
  });
  it('rejects path traversal, invalid colors and linked folders',async()=>{
    await expect(store.read('../outside')).rejects.toMatchObject({status:400});
    expect(()=>validateTemplateColors({...fixture,colors:{...fixture.colors,accent:'url(file:///private)'}})).toThrow();
    const outside=path.join(directory,'outside');await fs.mkdir(outside);const linked=path.join(directory,'linked');await fs.symlink(outside,linked,process.platform==='win32'?'junction':'dir');
    await expect(store.read('linked')).rejects.toThrow('符号链接');
  });
  it('discovers each template folder and reports malformed folders separately',async()=>{
    const copy=path.join(directory,'my-olive');await fs.mkdir(copy);await fs.writeFile(path.join(copy,'template.json'),JSON.stringify({version:1,id:'my-olive',name:'我的模板',description:'独立目录',bases:['gray','white'],colorsFile:'colors.json'}));await fs.writeFile(path.join(copy,'colors.json'),JSON.stringify(fixture));
    await fs.mkdir(path.join(directory,'broken'));
    const catalog=await store.list();expect(catalog.templates.map(item=>item.id)).toEqual(expect.arrayContaining(['olive-gold','my-olive']));expect(catalog.warnings).toHaveLength(1);
    expect(catalog.templates.find(item=>item.id==='my-olive').directory).toBe(copy);
  });
  it('opens only the resolved current folder without invoking a shell',async()=>{
    const launch=vi.fn(()=>{const child=new EventEmitter();child.unref=vi.fn();queueMicrotask(()=>child.emit('spawn'));return child;});
    const windows=await templateStore(directory,bundled,{platform:'win32',launch});await windows.save('olive-gold',{revision:initialRevision,colors:fixture});
    await windows.open('olive-gold');expect(launch).toHaveBeenCalledWith('explorer.exe',[path.join(directory,'olive-gold')],expect.objectContaining({shell:false,windowsHide:true}));
    await expect(windows.open('..')).rejects.toMatchObject({status:400});expect(launch).toHaveBeenCalledTimes(1);
  });
  it('imports new source folders automatically and preserves user colors on the first link',async()=>{
    const local={...fixture,customBase:'#334455'};await store.save('olive-gold',{revision:initialRevision,colors:local});store.close();
    const source=path.join(temporary,'source');await fs.cp(bundled,source,{recursive:true});store=await templateStore(directory,bundled,{sourceDirectory:source});
    expect((await store.read('olive-gold')).colors.customBase).toBe('#334455');
    const added=path.join(source,'new-theme');await fs.mkdir(added);await fs.writeFile(path.join(added,'template.json'),JSON.stringify({version:1,id:'new-theme',name:'新增源模板',description:'自动导入',bases:['white'],colorsFile:'colors.json'}));await fs.writeFile(path.join(added,'colors.json'),JSON.stringify(fixture));
    await store.syncSource();expect((await store.list()).templates.some(item=>item.id==='new-theme')).toBe(true);expect(JSON.parse(await fs.readFile(path.join(directory,'new-theme','colors.json'),'utf8')).version).toBe(1);
  });
  it('watches valid source updates, backs up local colors, and survives partial JSON writes',async()=>{
    await store.save('olive-gold',{revision:initialRevision,colors:{...fixture,customBase:'#334455'}});store.close();
    const source=path.join(temporary,'source');await fs.cp(bundled,source,{recursive:true});store=await templateStore(directory,bundled,{sourceDirectory:source});
    const sourceFile=path.join(source,'olive-gold','colors.json'),runtimeFile=path.join(directory,'olive-gold','colors.json');
    await fs.writeFile(sourceFile,'{"version":');await store.syncSource();expect((await store.read('olive-gold')).colors.customBase).toBe('#334455');expect((await store.list()).warnings.some(value=>value.includes('保留上一份'))).toBe(true);
    const update={...fixture,customBase:'#556677'};await fs.writeFile(sourceFile,JSON.stringify(update));
    await vi.waitFor(async()=>expect(JSON.parse(await fs.readFile(runtimeFile,'utf8')).customBase).toBe('#556677'),{timeout:4000,interval:80});
    expect(JSON.parse(await fs.readFile(path.join(directory,'olive-gold','colors.before-source.json'),'utf8')).customBase).toBe('#334455');
  });
  it('retains the source baseline across restarts without replacing later local edits',async()=>{
    const source=path.join(temporary,'source');await fs.cp(bundled,source,{recursive:true});store.close();store=await templateStore(directory,bundled,{sourceDirectory:source});
    const initial=await store.read('olive-gold');const saved=await store.save('olive-gold',{revision:initial.revision,colors:{...fixture,customBase:'#123456'}});store.close();
    store=await templateStore(directory,bundled,{sourceDirectory:source});expect((await store.read('olive-gold')).revision).toBe(saved.revision);expect((await store.read('olive-gold')).colors.customBase).toBe('#123456');
  });
  it('applies only changed source values and retains unrelated black customization',async()=>{
    const local=structuredClone(fixture);local.colorProfiles.black.accent='#bfb178';local.colors.accent='#bfb178';local.writingDockProfiles.black.aiButton.icon='#27301f';local.writingDock.aiButton.icon='#27301f';await store.save('olive-gold',{revision:initialRevision,colors:local});store.close();
    const source=path.join(temporary,'source');await fs.cp(bundled,source,{recursive:true});store=await templateStore(directory,bundled,{sourceDirectory:source});
    const update=structuredClone(fixture);update.surfaceColors.gray.document='#faf9f3';await fs.writeFile(path.join(source,'olive-gold','colors.json'),JSON.stringify(update));await store.syncSource();
    const result=(await store.read('olive-gold')).colors;expect(result.surfaceColors.gray.document).toBe('#faf9f3');expect(result.colorProfiles.black.accent).toBe('#bfb178');expect(result.writingDockProfiles.black.aiButton.icon).toBe('#27301f');
  });
  it('reconstructs a missing generated file from its durable authored baseline',async()=>{
    const authored=structuredClone(fixture);authored.surfaceColors.black.document='#293847';const saved=await store.save('olive-gold',{revision:initialRevision,colors:authored});
    expect(saved.defaults.surfaceColors.black.document).toBe('#293847');expect(JSON.parse(await fs.readFile(path.join(directory,'olive-gold','colors.before-save.json'),'utf8')).surfaceColors.black.document).toBe(fixture.surfaceColors.black.document);
    await fs.unlink(path.join(directory,'olive-gold','colors.json'));store.close();store=await templateStore(directory,path.join(temporary,'missing-bundle'));const restored=await store.read('olive-gold');expect(restored.colors.surfaceColors.black.document).toBe('#293847');expect(restored.defaults.surfaceColors.black.document).toBe('#293847');
  });
});
