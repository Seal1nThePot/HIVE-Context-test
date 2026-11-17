import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {extractFile} from '@electron/asar';

const project=process.cwd(),output=path.join(project,'delivery/editor-enhancements-20261118');
const snapshot=path.join(output,'package-source'),bundle=path.resolve(process.argv[2]||'release-editor-enhancements-20261118');
const archive=path.join(bundle,'win-unpacked/resources/app.asar');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex'),files=[];
function walk(base){for(const item of fs.readdirSync(path.join(snapshot,base),{withFileTypes:true})){const name=path.join(base,item.name);if(item.isDirectory())walk(name);else files.push(name);}}
for(const folder of ['dist','server','desktop','templates'])walk(folder);
const results=files.map(file=>({path:file.replaceAll('\\','/'),sha256:sha(fs.readFileSync(path.join(snapshot,file))),packagedSha256:sha(extractFile(archive,file))}));
assert.ok(results.every(file=>file.sha256===file.packagedSha256),'Packaged runtime differs from frozen build');
const current=JSON.parse(fs.readFileSync(path.join(snapshot,'package.json'),'utf8')),packaged=JSON.parse(extractFile(archive,'package.json').toString());
for(const key of ['version','name','main','dependencies'])assert.deepEqual(packaged[key],current[key],key);
const source=JSON.parse(fs.readFileSync(path.join(output,'source-manifest.json'),'utf8'));
const sourceDrift=source.files.filter(file=>!fs.existsSync(path.join(project,file.path))||sha(fs.readFileSync(path.join(project,file.path)))!==file.sha256).map(file=>file.path);
const result={passed:true,version:packaged.version,bundle,snapshot,archiveSha256:sha(fs.readFileSync(archive)),matchedRuntimeFiles:results.length,sourceDriftSinceSnapshot:sourceDrift,results};
fs.writeFileSync(path.join(output,'package-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:true,matchedRuntimeFiles:results.length,sourceDriftSinceSnapshot:sourceDrift,archiveSha256:result.archiveSha256}));
