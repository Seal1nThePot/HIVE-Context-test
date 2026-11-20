import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {extractFile,listPackage} from '@electron/asar';

const project=fileURLToPath(new URL('../',import.meta.url));
const bundle=path.resolve(process.argv[2]||path.join(project,'release'));
const output=path.resolve(process.env.HIVE_VERIFY_OUTPUT||path.join(project,'.runtime/checks'));
const archive=path.join(bundle,'win-unpacked/resources/app.asar');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const files=['LICENSE'];
function walk(relative){
  for(const item of fs.readdirSync(path.join(project,relative),{withFileTypes:true})){
    const file=path.join(relative,item.name);
    if(item.isDirectory())walk(file);
    else if(!/\.test\./.test(item.name))files.push(file);
  }
}
for(const dir of ['dist','server','desktop','shared','templates'])walk(dir);
const results=files.map(file=>({
  path:file.replaceAll('\\','/'),
  matches:hash(fs.readFileSync(path.join(project,file)))===hash(extractFile(archive,file)),
}));
assert(results.every(file=>file.matches),'Packaged runtime differs from current source/build');
const current=JSON.parse(fs.readFileSync(path.join(project,'package.json'),'utf8'));
const packaged=JSON.parse(extractFile(archive,'package.json').toString());
for(const field of ['version','name','main','dependencies'])assert.deepEqual(packaged[field],current[field],field);
assert(!listPackage(archive).some(file=>/\.test\./.test(file)),'Development tests must not ship');
const report={passed:true,version:packaged.version,matchedRuntimeFiles:results.length,archiveSha256:hash(fs.readFileSync(archive)),results};
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'package-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,version:report.version,matchedRuntimeFiles:results.length,archiveSha256:report.archiveSha256}));
