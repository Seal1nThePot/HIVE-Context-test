import {describe, it, expect, vi} from 'vitest';
import {createRequire} from 'node:module';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const {createBuildInfo, validBuildInfo} = require('./buildMetadata.cjs');
const {createAboutHandlers} = require('./about.cjs');
const pkg = {name:'hive',version:'1.2.3',build:{productName:'HIVE'}};
const make = (command='build', env={}) => createBuildInfo(pkg,{command,env,now:new Date('2026-01-02T03:04:05.000Z'),random:()=> 'abc123'});
describe('about metadata and IPC', () => {
  it('generates distinct development and build channels with validated release identifiers', () => {
    expect(make('serve').channel).toBe('development');
    expect(make().channel).toBe('local');
    expect(make('build',{HIVE_BUILD_CHANNEL:'stable',HIVE_BUILD_NUMBER:'ci-12'}).buildNumber).toBe('ci-12');
    for (const env of [{HIVE_BUILD_NUMBER:'C:\\secret'}, {HIVE_BUILD_NUMBER:'a\nb'}, {HIVE_BUILD_CHANNEL:'https://example.com'}, {HIVE_BUILD_CHANNEL:'Stable'}]) expect(()=>make('build',env)).toThrow();
    expect(()=>make('serve',{HIVE_BUILD_CHANNEL:'stable'})).toThrow();
    expect(validBuildInfo(make(),pkg)).toBe(true);
    expect(validBuildInfo({...make(),version:'other'},pkg)).toBe(false);
    expect(validBuildInfo({...make(),buildTime:'2026-02-31T03:04:05.000Z'},pkg)).toBe(false);
  });
  it('uses the actual package manifest, rejects untrusted senders and never reveals paths on errors', async () => {
    const root=mkdtempSync(path.join(tmpdir(),'hive-about-'));
    try {
      mkdirSync(path.join(root,'dist'));
      writeFileSync(path.join(root,'package.json'),JSON.stringify(pkg));
      writeFileSync(path.join(root,'dist','build-info.json'),JSON.stringify({...make(),profilePath:'C:\\\\private',secret:'key'}));
      const app={isPackaged:true,getPath:vi.fn(()=> 'C:\\private\\data')};
      const shell={openPath:vi.fn(async()=> 'C:\\private\\data failure')};
      const handlers=createAboutHandlers({isMainOrigin:e=>e.trusted,app,shell,root,versions:{electron:'45',chrome:'144',node:'24',secret:'hidden'},platform:'win32',arch:'x64',development:false});
      expect(handlers.getAboutInfo({trusted:true})).toEqual({...make(),runtime:{mode:'desktop-package',platform:'win32',arch:'x64',electron:'45',chrome:'144',node:'24',packaged:true}});
      expect(()=>handlers.getAboutInfo({trusted:false})).toThrow();
      await expect(handlers.openAppDataDirectory({trusted:false})).rejects.toThrow();
      expect(shell.openPath).not.toHaveBeenCalled();
      await expect(handlers.openAppDataDirectory({trusted:true},'C:\\other')).rejects.toThrow('无法打开应用数据目录');
      expect(app.getPath).toHaveBeenCalledWith('userData');
      expect(shell.openPath).toHaveBeenCalledWith('C:\\private\\data');
      shell.openPath.mockRejectedValue(new Error('C:\\private\\data'));
      await expect(handlers.openAppDataDirectory({trusted:true})).rejects.not.toThrow('C:\\private');
      writeFileSync(path.join(root,'dist','build-info.json'),JSON.stringify({...make(),version:'0.0.1'}));
      expect(handlers.getAboutInfo({trusted:true})).toMatchObject({version:'1.2.3',channel:'unavailable',buildNumber:'unavailable'});
      const dev=createAboutHandlers({isMainOrigin:()=>true,app:{...app,isPackaged:false},shell,root,versions:{},platform:'win32',arch:'x64',development:true});
      expect(dev.getAboutInfo({})).toMatchObject({channel:'development',runtime:{mode:'desktop-development',packaged:false}});
    } finally {
      const resolvedRoot=path.resolve(root);
      if(path.dirname(resolvedRoot)!==path.resolve(tmpdir())||!path.basename(resolvedRoot).startsWith('hive-about-'))throw new Error('Unexpected about test cleanup path');
      rmSync(resolvedRoot,{recursive:true,force:true});
    }
  });
});


