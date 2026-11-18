import {describe,expect,it} from 'vitest';
import blue from '../../../templates/claude-mediterranean-blue/colors.json';
import {applyUserProfile,createTemplateBinding,templateBaseDefaults,userProfileFor} from './templateBinding';
import {normalizeTheme,switchThemeBase} from './themePreferences';

describe('reasoning track colors',()=>{
  const identity={id:'track-test',name:'test',bases:['black','white'] as ('black'|'white')[]};
  it('preserves independent base choices across template user profile reload',()=>{
    const binding=createTemplateBinding(identity,blue),base=templateBaseDefaults(binding,'white');
    const edited=normalizeTheme({...base,reasoningTrackProfiles:{white:{left:'#112233',middle:'#445566',right:'#778899'}}});
    const switched=switchThemeBase(edited,'black');expect(switched.reasoningTrackProfiles?.white?.middle).toBe('#445566');
    const black=normalizeTheme({...switched,reasoningTrackProfiles:{...switched.reasoningTrackProfiles,black:{left:'#aabbcc',middle:'#bbccdd',right:'#ccddee'}}});
    const loaded=applyUserProfile(binding,userProfileFor(binding,black,base)).preferences;
    expect(loaded.reasoningTrackProfiles?.black?.left).toBe('#aabbcc');expect(switchThemeBase(loaded,'white').reasoningTrackProfiles?.white?.right).toBe('#778899');
  });
  it('rejects invalid partial profiles and respects template baseline',()=>{
    const binding=createTemplateBinding(identity,{...blue,reasoningTrackProfiles:{white:{left:'#123456',middle:'#234567',right:'#345678'},black:{left:'bad',middle:'#234567',right:'#345678'}}});
    expect(templateBaseDefaults(binding,'white').reasoningTrackProfiles?.white?.left).toBe('#123456');expect(templateBaseDefaults(binding,'black').reasoningTrackProfiles?.black).toBeUndefined();
    expect(normalizeTheme(blue).reasoningTrackProfiles).toBeUndefined();
  });
});
