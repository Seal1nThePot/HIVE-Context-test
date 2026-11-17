import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {extractFile} from '@electron/asar';

const output=path.resolve(process.env.HIVE_FILE_LIBRARY_OUTPUT||'delivery/file-library-20261118');
const bundle=path.resolve(process.argv[2]||'release-file-library-20261118-r4');
const sourceRoot=path.resolve(process.env.HIVE_FILE_LIBRARY_SOURCE||'.');
const archive=path.join(bundle,'win-unpacked/resources/app.asar');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const files=[];
function walk(folder){for(const item of fs.readdirSync(path.join(sourceRoot,folder),{withFileTypes:true})){const target=path.join(folder,item.name);if(item.isDirectory())walk(target);else files.push(target);}}
for(const folder of ['dist','server','desktop','templates'])walk(folder);
const results=files.map(file=>({path:file.replaceAll('\\','/'),sha256:sha(fs.readFileSync(path.join(sourceRoot,file))),packagedSha256:sha(extractFile(archive,file))}));
assert.ok(results.every(file=>file.sha256===file.packagedSha256),'Packaged runtime differs from source/build: '+results.filter(file=>file.sha256!==file.packagedSha256).map(file=>file.path).join(', '));
const sourcePackage=JSON.parse(fs.readFileSync(path.join(sourceRoot,'package.json'),'utf8')),packaged=JSON.parse(extractFile(archive,'package.json').toString());
for(const key of ['version','name','main','dependencies'])assert.deepEqual(packaged[key],sourcePackage[key],'Packaged metadata differs: '+key);
const workspaceDriftSinceSnapshot=results.filter(file=>!fs.existsSync(file.path)||sha(fs.readFileSync(file.path))!==file.sha256).map(file=>file.path);
const manifest={version:packaged.version,purpose:'internal-validation',output:bundle,sourceRoot,checkedAt:new Date().toISOString(),matchedFiles:results.length,archiveSha256:sha(fs.readFileSync(archive)),metadataChecked:['version','name','main','dependencies'],workspaceDriftSinceSnapshot,results};
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'package-verification.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({passed:true,matchedFiles:results.length,archiveSha256:manifest.archiveSha256}));
