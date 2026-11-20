import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {extractFile} from '@electron/asar';

const require = createRequire(import.meta.url);
const {validBuildInfo} = require('../desktop/buildMetadata.cjs');
const {isNewer} = require('../desktop/localUpdate.cjs');
const project = require('../package.json');
const [bundle, destination] = process.argv.slice(2);
if (!bundle) {
  throw new Error('用法：npm run update:bundle -- <win-unpacked 目录> [发布目录]');
}
const resources = path.join(path.resolve(bundle), 'resources');
const archive = path.join(resources, 'app.asar');
const bytes = (await fs.promises.stat(archive)).size;
if (fs.existsSync(path.join(resources, 'app.asar.unpacked'))) {
  throw new Error('这个程序包包含 ASAR 外的应用文件，需要发布完整程序包。');
}
const metadata = JSON.parse(extractFile(archive, 'dist/build-info.json'));
const packaged = JSON.parse(extractFile(archive, 'package.json'));
if (packaged.name !== project.name || packaged.main !== project.main ||
    !validBuildInfo(metadata, {...packaged, build: project.build})) {
  throw new Error('程序包的应用标识或构建记录无效。');
}
extractFile(archive, 'desktop/localUpdate.cjs');
const output = path.resolve(destination || fileURLToPath(new URL('../../stable-relese', import.meta.url)));
await fs.promises.mkdir(output, {recursive: true});
const latest = path.join(output, 'latest');
const lock = path.join(output, '.publish-lock');
await fs.promises.mkdir(lock);
const staged = path.join(output, '.publish-' + randomUUID());
const previous = path.join(output, '.previous-' + randomUUID());
const files = ['app.asar', 'update.hive.json'];

async function removePackage(directory) {
  for (const name of files) await fs.promises.rm(path.join(directory, name), {force: true});
  await fs.promises.rmdir(directory);
}

let oldMoved = false;
let stagedCreated = false;
try {
  const existing = await fs.promises.lstat(latest).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing) {
    if (!existing.isDirectory() || existing.isSymbolicLink() ||
        (await fs.promises.readdir(latest)).sort().join(',') !== files.join(',')) {
      throw new Error('latest 目录包含其他内容，请检查发布目录。');
    }
    const oldPackage = path.join(latest, 'app.asar');
    const oldBuild = JSON.parse(extractFile(oldPackage, 'dist/build-info.json'));
    if (!isNewer(oldBuild, metadata)) throw new Error('发布目录已有相同或较新的构建。');
  }
  await fs.promises.mkdir(staged);
  stagedCreated = true;
  const copy = path.join(staged, 'app.asar');
  await fs.promises.copyFile(archive, copy, fs.constants.COPYFILE_EXCL);
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(copy)) hash.update(chunk);
  const manifest = {
    format: 1, appId: project.build.appId, platform: 'win32', arch: 'x64',
    electron: require('electron/package.json').version, bytes, sha256: hash.digest('hex'), build: metadata,
  };
  await fs.promises.writeFile(path.join(staged, 'update.hive.json'), JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx'});
  if (existing) {
    await fs.promises.rename(latest, previous);
    oldMoved = true;
  }
  try {
    await fs.promises.rename(staged, latest);
    stagedCreated = false;
  } catch (error) {
    if (oldMoved) await fs.promises.rename(previous, latest);
    throw error;
  }
  if (oldMoved) await removePackage(previous);
  console.log(metadata.version, metadata.buildNumber, latest);
} finally {
  if (stagedCreated) await removePackage(staged);
  await fs.promises.rmdir(lock);
}
