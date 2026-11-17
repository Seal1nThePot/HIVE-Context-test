import {readdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {describe,it,expect} from 'vitest';
import {createTemplateBinding,templateBaseDefaults,type TemplateIdentity} from './templateBinding';

const folder=fileURLToPath(new URL('../../../templates/',import.meta.url));
const templates=readdirSync(folder,{withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>({
  identity:JSON.parse(readFileSync(path.join(folder,entry.name,'template.json'),'utf8')) as TemplateIdentity,
  colors:JSON.parse(readFileSync(path.join(folder,entry.name,'colors.json'),'utf8')),
}));
describe('0.1.3 theme binding with retained 0.1.4 templates',()=>{
  it.each(templates)('loads every declared base for $identity.id without borrowing another template',({identity,colors})=>{
    const binding=createTemplateBinding(identity,colors);expect(binding.bases).toEqual(identity.bases);
    for(const base of identity.bases){
      const resolved=templateBaseDefaults(binding,base);
      expect(resolved.base).toBe(base);expect(resolved.colors).toEqual(colors.colorProfiles[base]);
      expect(resolved.surfaceColors[base]).toEqual(colors.surfaceColors[base]);
      expect(Object.keys(resolved.colorProfiles).sort()).toEqual([...identity.bases].sort());
    }
  });
});
