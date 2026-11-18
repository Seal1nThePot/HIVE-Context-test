import {describe,expect,it} from 'vitest';
import olive from '../../../templates/claude-olive-gold/colors.json';
import blue from '../../../templates/claude-mediterranean-blue/colors.json';
import {applyUserProfile,createTemplateBinding,normalizeWithinTemplate,templateBaseDefaults,userProfileFor} from './templateBinding';
import {updateThemeColors} from './themePreferences';
const identity={id:'claude-mediterranean-blue',name:'地中海蓝',bases:['black','white'] as ('black'|'white')[]};
describe('bound template defaults',()=>{
  it('rejects an incomplete foreign base and never creates an undeclared olive gray',()=>{
    const binding=createTemplateBinding(identity,blue),black=templateBaseDefaults(binding,'black');const result=normalizeWithinTemplate({...black,base:'gray',colorProfiles:{...black.colorProfiles,gray:olive.colorProfiles.gray}},binding);expect(result.base).toBe('white');expect(result.colorProfiles.gray).toBeUndefined();expect(result.colors).toEqual(blue.colorProfiles.white);
    const incomplete=structuredClone(blue);delete (incomplete.surfaceColors.black as Partial<typeof incomplete.surfaceColors.black>).input;expect(()=>createTemplateBinding(identity,incomplete)).toThrow('不完整');
  });
  it('keeps a personal edit over a changed template and freezes the personal default snapshot',()=>{
    const binding=createTemplateBinding(identity,blue),black=templateBaseDefaults(binding,'black'),edited=updateThemeColors(black,{accent:'#123456'}),profile=userProfileFor(binding,edited,black);const changed=structuredClone(blue);changed.surfaceColors.black.panel='#203040';changed.colorProfiles.black.link='#abcdef';const next=createTemplateBinding(identity,changed),applied=applyUserProfile(next,profile);
    expect(applied.preferences.colors.accent).toBe('#123456');expect(applied.preferences.surfaceColors.black?.panel).toBe('#203040');expect(applied.preferences.colors.link).toBe('#abcdef');expect(applied.defaultScheme.surfaceColors.black?.panel).toBe(blue.surfaceColors.black.panel);expect(applied.defaultScheme.colors.link).toBe(blue.colorProfiles.black.link);
  });
});
