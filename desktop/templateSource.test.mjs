import {afterEach,expect,it} from 'vitest';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {resolveTemplateSource} from './templateSource.cjs';
let temporary;
afterEach(async()=>{if(temporary&&path.dirname(temporary)===os.tmpdir()&&path.basename(temporary).startsWith('hive-template-source-'))await fs.rm(temporary,{recursive:true,force:true});});
it('finds the project source folder from an unpacked or portable package',async()=>{
  temporary=await fs.mkdtemp(path.join(os.tmpdir(),'hive-template-source-'));const project=path.join(temporary,'project');await fs.mkdir(path.join(project,'templates'),{recursive:true});
  const executablePath=path.join(project,'release','win-unpacked','HIVE.exe'),projectRoot=path.join(project,'release','win-unpacked','resources','app.asar');
  expect(resolveTemplateSource({projectRoot,executablePath})).toBe(path.join(project,'templates'));
  expect(resolveTemplateSource({projectRoot,executablePath:path.join(temporary,'extracted','HIVE.exe'),portableDirectory:path.join(project,'release')})).toBe(path.join(project,'templates'));
});
it('uses an explicit source location even before its directory is created',()=>{expect(resolveTemplateSource({projectRoot:os.tmpdir(),override:path.join(os.tmpdir(),'future-templates')})).toBe(path.join(os.tmpdir(),'future-templates'));});
