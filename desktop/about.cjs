const fs = require('node:fs');
const path = require('node:path');
const {createBuildInfo, validBuildInfo} = require('./buildMetadata.cjs');
function createAboutHandlers({isMainOrigin, app, shell, root, versions, platform, arch, development}) {
  const pkg = require(path.join(root, 'package.json'));
  const devInfo = development ? createBuildInfo(pkg, {command:'serve', env:{}}) : null;
  const authorize = event => { if (!isMainOrigin(event)) throw new Error('无权执行此操作'); };
  return {
    getAboutInfo(event) {
      authorize(event);
      let info = devInfo;
      if (!info) {
        try {
          const candidate = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'build-info.json'), 'utf8'));
          if (validBuildInfo(candidate, pkg)) info = {appName:candidate.appName, version:candidate.version, buildNumber:candidate.buildNumber, buildTime:candidate.buildTime, channel:candidate.channel};
        } catch { /* Report unavailable metadata without exposing paths. */ }
      }
      if (!info) info = {appName: pkg.build?.productName || pkg.name, version: pkg.version, buildNumber:'unavailable', buildTime:'unavailable', channel:'unavailable'};
      return {...info, runtime: {mode: app.isPackaged ? 'desktop-package' : 'desktop-development', platform, arch, electron: versions.electron, chrome: versions.chrome, node: versions.node, packaged: app.isPackaged}};
    },
    async openAppDataDirectory(event) {
      authorize(event);
      try {
        const error = await shell.openPath(app.getPath('userData'));
        if (error) throw new Error();
      } catch { throw new Error('无法打开应用数据目录，请检查系统权限后重试。'); }
    },
  };
}
module.exports = {createAboutHandlers};

