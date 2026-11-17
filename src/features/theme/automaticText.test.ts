import {describe,expect,it} from 'vitest';
import blue from '../../../templates/mediterranean-blue/colors.json';
import olive from '../../../templates/olive-gold/colors.json';
import {automaticTextTokens,compositeBackground} from './automaticText';
import {createTemplateBinding,templateBaseDefaults} from './templateBinding';
import {themeTokens} from './themePreferences';
function contrast(a:string,b:string){const l=(x:string)=>{const c=[1,3,5].map(i=>parseInt(x.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};const x=l(a),y=l(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
describe('per-surface pure black and white text',()=>{
  it('chooses readable pure colors for all declared blue and olive surfaces',()=>{
    for(const [id,name,bases,raw] of [['olive-gold','青苔鎏金',['black','gray','white'],olive],['mediterranean-blue','地中海蓝',['black','white'],blue]] as const){const binding=createTemplateBinding({id,name,bases:[...bases]},raw);for(const base of bases){const theme=templateBaseDefaults(binding,base),tokens=automaticTextTokens(theme),s=themeTokens(theme).surfaces;for(const [variable,background] of [['--text',s.panel],['--hive-document-text',s.document],['--hive-settings-card-text',s.settingsCard],['--hive-input-text',s.input],['--hive-selection-text',s.selection],['--hive-on-accent',theme.colors.accent]]){expect(['#000000','#ffffff']).toContain(tokens[variable]);expect(contrast(tokens[variable],background)).toBeGreaterThanOrEqual(4.5);}}}
  });
  it('composites transparent colors before choosing a foreground',()=>{expect(compositeBackground('#00000000','#ffffff')).toBe('#ffffff');expect(compositeBackground('#00000080','#ffffff')).toBe('#7f7f7f');});
});
