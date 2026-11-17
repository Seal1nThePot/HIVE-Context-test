import type {AboutInfo, BuildInfo} from '../../shared/buildInfo';

export type AboutDesktopBridge = {
  getAboutInfo: () => Promise<AboutInfo>;
  openAppDataDirectory: () => Promise<void>;
};

export const aboutSearchKeywords = '版本 version 构建 build 帮助 help 许可证 license 诊断 diagnostic 更新 日志 changelog 数据目录';

// Only coarse platform information is used. Never copy a user agent string.
export function browserPlatform(platform: string): string {
  if (/win/i.test(platform)) return 'Windows';
  if (/mac|iphone|ipad/i.test(platform)) return 'Apple';
  if (/linux/i.test(platform)) return 'Linux';
  return 'unknown';
}

export function browserAboutInfo(build: BuildInfo, development: boolean, platform = ''): AboutInfo {
  return {...build, runtime: {
    mode: development ? 'browser-development' : 'browser-build',
    platform: browserPlatform(platform), arch: 'unknown', packaged: false,
  }};
}

export async function readDesktopAboutInfo(bridge: Pick<AboutDesktopBridge, 'getAboutInfo'>): Promise<AboutInfo | null> {
  try {
    const info = await bridge.getAboutInfo();
    if (!info || !info.runtime || !['desktop-development', 'desktop-package'].includes(info.runtime.mode)
      || typeof info.runtime.packaged !== 'boolean'
      || !['appName', 'version', 'buildNumber', 'buildTime', 'channel'].every(key => typeof info[key as keyof BuildInfo] === 'string')
      || ![info.runtime.electron, info.runtime.chrome, info.runtime.node].every(value => value === undefined || typeof value === 'string')
      || typeof info.runtime.platform !== 'string' || typeof info.runtime.arch !== 'string') return null;
    return info;
  } catch {
    return null;
  }
}

// Diagnostic values are restricted as well as keys. Paths, URLs, multiline text
// and unexpected runtime data are excluded even if supplied by a stale bridge.
const token = (value: unknown) => typeof value === 'string' && /^[\p{L}\p{N} ._+()\-]{1,120}$/u.test(value) ? value : 'unknown';
const buildTime = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) ? value : 'unknown';

export function diagnosticPreview(build: BuildInfo, info: AboutInfo | null, desktop: boolean): string {
  const metadata = info || build;
  const runtime = info?.runtime;
  return JSON.stringify({
    appName: token(metadata.appName), version: token(metadata.version),
    buildNumber: token(metadata.buildNumber), buildTime: buildTime(metadata.buildTime), channel: token(metadata.channel),
    metadataSource: info ? desktop ? 'desktop' : 'renderer-build' : 'renderer-build-fallback',
    desktop,
    runtime: runtime ? {
      mode: ['desktop-development', 'desktop-package', 'browser-development', 'browser-build'].includes(runtime.mode) ? runtime.mode : 'unknown',
      platform: token(runtime.platform), arch: token(runtime.arch), packaged: runtime.packaged === true,
      ...(runtime.electron ? {electron: token(runtime.electron)} : {}),
      ...(runtime.chrome ? {chrome: token(runtime.chrome)} : {}),
      ...(runtime.node ? {node: token(runtime.node)} : {}),
    } : null,
  }, null, 2);
}

export async function copyAboutDiagnostic(preview: string, clipboard?: Pick<Clipboard, 'writeText'>): Promise<'copied' | 'unavailable' | 'failed'> {
  if (!clipboard?.writeText) return 'unavailable';
  try { await clipboard.writeText(preview); return 'copied'; }
  catch { return 'failed'; }
}

export async function openAboutDataDirectory(bridge: Pick<AboutDesktopBridge, 'openAppDataDirectory'>): Promise<boolean> {
  try { await bridge.openAppDataDirectory(); return true; }
  catch { return false; }
}
