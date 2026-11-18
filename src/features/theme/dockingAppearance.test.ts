import {describe,it,expect} from 'vitest';
import {defaultTheme,normalizeTheme,readDefaultTheme,readTheme,resetThemeBase,switchThemeBase,themeTokens} from './themePreferences';
import {dockingColors,dockingColorFields,dockingTokens,normalizeDockingProfiles} from './dockingAppearance';
import {applyUserProfile,createTemplateBinding,templateBaseDefaults,userProfileFor} from './templateBinding';
import {applyThemeTokens} from './applyTheme';
import blue from '../../../templates/claude-mediterranean-blue/colors.json';

describe('custom docking and rail appearance',()=>{
  it('keeps a saved default frozen when a template later adds docking overrides',()=>{
    const identity={id:'claude-mediterranean-blue',name:'blue',bases:['black','white'] as const},{dockingProfiles:_dock,...plain}=blue,binding=createTemplateBinding({...identity,bases:[...identity.bases]},plain),saved=templateBaseDefaults(binding,'black'),profile=userProfileFor(binding,saved,saved);
    const next=createTemplateBinding({...identity,bases:[...identity.bases]},{...plain,dockingProfiles:{black:{guideIcon:'#abcdef'}}}),result=applyUserProfile(next,profile);
    expect(dockingColors(result.preferences).guideIcon).toBe('#abcdef');expect(dockingColors(result.defaultScheme).guideIcon).toBe(dockingColors(saved).guideIcon);expect(result.defaultScheme.dockingProfiles).toEqual({});
  });
  it('derives missing fields from the active foreign template instead of olive constants',()=>{
    const binding=createTemplateBinding({id:'claude-mediterranean-blue',name:'blue',bases:['black','white']},blue);
    for(const base of binding.bases){const theme=templateBaseDefaults(binding,base),s=themeTokens(theme).surfaces,c=dockingColors(theme);expect(c.guideBackground).toBe(s.popup+'f2');expect(c.railActiveBackground).toBe(theme.colors.accent+'77');expect(c.guideBorder).toBe(s.popupBorder);}
  });
  it('accepts alpha only on supported fields and rejects injected CSS and unknown keys',()=>{
    expect(normalizeDockingProfiles({black:{guideBackground:'#ABCDEF55',guideIcon:'#abcdef55',railBackground:'url(x)',railBorder:'#123456',unexpected:'#111111'},white:[]})).toEqual({black:{guideBackground:'#abcdef55',railBorder:'#123456'}});
  });
  it('retains colors and transparency across persistence, default schemes and base switches',()=>{
    const theme=normalizeTheme({...defaultTheme,dockingProfiles:{black:{guideIcon:'#123456',previewBackground:'#65432188'},white:{guideIcon:'#abcdef'}}});
    expect(readTheme(JSON.stringify(theme))).toEqual(theme);expect(readDefaultTheme(JSON.stringify({defaultScheme:theme}))).toEqual(theme);
    expect(dockingColors(switchThemeBase(theme,'white')).guideIcon).toBe('#abcdef');expect(dockingColors(switchThemeBase(switchThemeBase(theme,'white'),'black')).guideIcon).toBe('#123456');
    const reset=resetThemeBase(theme);expect(reset.dockingProfiles.black).toBeUndefined();expect(reset.dockingProfiles.white?.guideIcon).toBe('#abcdef');
  });
  it('applies every custom field to root variables without ordinary-text overrides',()=>{
    const profile=Object.fromEntries(Object.entries(dockingColorFields).map(([key,field])=>[key,field.alpha?'#12345678':'#654321']));
    const theme=normalizeTheme({...defaultTheme,dockingProfiles:{black:profile}}),values:Record<string,string>={};
    const root={style:{getPropertyValue:(key:string)=>values[key],setProperty:(key:string,value:string)=>{values[key]=value;}},classList:{toggle:()=>{}}} as unknown as HTMLElement;
    applyThemeTokens(root,theme);for(const [key,value] of Object.entries(dockingTokens(theme)))expect(values[key]).toBe(value);
    expect(values['--hive-dock-guide-icon']).toBe('#654321');expect(values['--hive-shadow-color']).toBe('#12345678');
  });
});
