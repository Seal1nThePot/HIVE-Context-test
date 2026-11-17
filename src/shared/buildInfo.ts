export interface BuildInfo {
  appName: string;
  version: string;
  buildNumber: string;
  buildTime: string;
  channel: string;
}
export interface AboutInfo extends BuildInfo {
  runtime: {
    mode: 'desktop-development' | 'desktop-package' | 'browser-development' | 'browser-build';
    platform: string;
    arch: string;
    electron?: string;
    chrome?: string;
    node?: string;
    packaged: boolean;
  };
}
declare global {
  const __HIVE_BUILD_INFO__: BuildInfo;
}
