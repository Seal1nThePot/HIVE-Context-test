import {describe, expect, it, vi} from 'vitest';
import type {AboutInfo, BuildInfo} from '../../shared/buildInfo';
import {browserAboutInfo, copyAboutDiagnostic, diagnosticPreview, openAboutDataDirectory, readDesktopAboutInfo} from './aboutInfo';

const build: BuildInfo = {appName:'HIVE markdown editor', version:'0.1.4', buildNumber:'20261118-dev', buildTime:'2026-11-18T00:00:00.000Z', channel:'development'};
const desktop: AboutInfo = {...build, runtime:{mode:'desktop-package', platform:'win32', arch:'x64', packaged:true, electron:'45.3.3', chrome:'143.0.0', node:'24.0.0'}};

describe('about diagnostic privacy and metadata fallback', () => {
  it('copies an explicit whitelist and excludes private fields at every level', () => {
    const hostile = {...desktop, body:'private manuscript', chat:'private conversation', apiKey:'secret', endpoint:'https://private.test', serviceName:'private service', id:'private-id', path:'C:\\private',
      runtime:{...desktop.runtime, userAgent:'private user agent', path:'C:\\private', config:{key:'secret'}}};
    const preview = diagnosticPreview(build, hostile, true);
    const result = JSON.parse(preview);
    expect(Object.keys(result)).toEqual(['appName','version','buildNumber','buildTime','channel','metadataSource','desktop','runtime']);
    expect(Object.keys(result.runtime)).toEqual(['mode','platform','arch','packaged','electron','chrome','node']);
    expect(preview).not.toMatch(/private|secret|endpoint|serviceName|userAgent/);
    expect(result.version).toBe('0.1.4');
    expect(result.runtime.packaged).toBe(true);
  });

  it('rejects paths, URLs and injected multiline data even inside allowed fields', () => {
    const hostile = {...desktop, appName:'C:\\Users\\private', version:'0.1.4\nsecret', buildTime:'not a date', channel:'https://private.test',
      runtime:{...desktop.runtime, platform:'/home/private', arch:'file:///private', electron:'45\nsecret'}};
    const preview = diagnosticPreview(build, hostile, true);
    expect(preview).not.toMatch(/private|secret|https|file:/);
    expect(JSON.parse(preview)).toMatchObject({appName:'unknown', version:'unknown', buildTime:'unknown', channel:'unknown', runtime:{platform:'unknown', arch:'unknown', electron:'unknown'}});
  });

  it('reports coarse browser information without guessing architecture or desktop packaging', () => {
    const info = browserAboutInfo(build, true, 'Win32');
    expect(info.runtime).toEqual({mode:'browser-development', platform:'Windows', arch:'unknown', packaged:false});
    expect(browserAboutInfo(build, false, 'unrecognized-private-platform').runtime).toEqual({mode:'browser-build', platform:'unknown', arch:'unknown', packaged:false});
    expect(browserAboutInfo(build, false, 'MacIntel').runtime.platform).toBe('Apple');
    expect(browserAboutInfo(build, false, 'Linux x86_64').runtime.platform).toBe('Linux');
  });

  it('falls back explicitly when desktop reading rejects or returns invalid data', async () => {
    expect(await readDesktopAboutInfo({getAboutInfo:vi.fn().mockRejectedValue(new Error('C:\\private\\secret'))})).toBeNull();
    expect(await readDesktopAboutInfo({getAboutInfo:vi.fn().mockResolvedValue({...desktop, runtime:{mode:'browser-build'}})})).toBeNull();
    expect(await readDesktopAboutInfo({getAboutInfo:vi.fn().mockResolvedValue({...desktop, runtime:{...desktop.runtime, electron:{private:'path'}}})})).toBeNull();
    const result = JSON.parse(diagnosticPreview(build, null, true));
    expect(result).toMatchObject({version:'0.1.4', metadataSource:'renderer-build-fallback', desktop:true, runtime:null});
    expect(await readDesktopAboutInfo({getAboutInfo:vi.fn().mockResolvedValue(desktop)})).toBe(desktop);
  });
});

describe('about actions remain local on failure', () => {
  it('copies exactly the supplied preview and contains clipboard rejection', async () => {
    const preview = diagnosticPreview(build, desktop, true);
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await copyAboutDiagnostic(preview, {writeText})).toBe('copied');
    expect(writeText).toHaveBeenCalledExactlyOnceWith(preview);
    expect(await copyAboutDiagnostic(preview)).toBe('unavailable');
    expect(await copyAboutDiagnostic(preview, {writeText:vi.fn().mockRejectedValue(new Error('private path'))})).toBe('failed');
  });

  it('does not expose native error text or paths when directory opening fails', async () => {
    expect(await openAboutDataDirectory({openAppDataDirectory:vi.fn().mockRejectedValue(new Error('C:\\private\\secret'))})).toBe(false);
    expect(await openAboutDataDirectory({openAppDataDirectory:vi.fn().mockResolvedValue(undefined)})).toBe(true);
  });
});
