import {describe,expect,it} from 'vitest';
import {brightness,defaultTheme,normalizeTheme,readDefaultTheme,readTheme,themeTokens} from './themePreferences';
import {oliveWhiteSurfaces} from './oliveGoldBuiltins';
import {applyThemeTokens} from './applyTheme';
import {normalizeSurfaceProfiles,oliveBlackSurfaces,resolveSurfaceColors} from './surfaceAppearance';

describe('青苔鎏金 black surfaces',()=>{
  it('uses an olive palette with the darkest title bar and a lighter document',()=>{
    const s=themeTokens(defaultTheme).surfaces;expect(s).toEqual(oliveBlackSurfaces);
    for(const role of ['panel','panelHeader','ribbon','document'] as const)expect(brightness(s.titleBar)).toBeLessThan(brightness(s[role]));
    for(const role of ['panel','panelHeader','ribbon','popup'] as const)expect(brightness(s.document)).toBeGreaterThan(brightness(s[role]));
    expect(brightness(s.ribbonBorder)).toBeGreaterThan(brightness(s.ribbon));expect(s.settingsCard).toBe('#222820');
  });
  it('keeps exact document, panel and ribbon colors independent and scopes edits by base',()=>{
    const p=normalizeTheme({...defaultTheme,surfaceColors:{black:{document:'#334433',documentText:'#f0f0e0',panel:'#182218',ribbon:'#202a1f'},white:{document:'#fefefe'}}});
    const s=themeTokens(p).surfaces;expect(s.document).toBe('#334433');expect(s.documentText).toBe('#f0f0e0');expect(s.panel).toBe('#182218');expect(s.ribbon).toBe('#202a1f');
    const changed=themeTokens({...p,colors:{...p.colors,accent:'#ff6600'},surfaceContrastMode:'manual',surfaceContrast:150}).surfaces;expect(changed.document).toBe(s.document);expect(changed.panel).toBe(s.panel);
    expect(themeTokens({...p,base:'white'}).surfaces.document).toBe('#fefefe');expect(readTheme(JSON.stringify(p))).toEqual(p);
  });
  it('rejects injected colors and unknown keys, and migrates older preferences',()=>{
    expect(normalizeSurfaceProfiles({black:{document:'url(x)',panel:'#ABCDEF',unexpected:'#123456'},white:null})).toEqual({black:{panel:'#abcdef'}});
    const old=normalizeTheme({version:1,base:'black',palette:'hive',colors:{accent:'#b4aa83'}});expect(old.surfaceColors).toEqual({});expect(themeTokens(old).surfaces).toEqual(oliveBlackSurfaces);expect(old.writingDock.frame.background).toBe('#27301ff2');
    expect(resolveSurfaceColors('black','#123456',1,{black:{panel:'#123456'}}).document).toBe(oliveBlackSurfaces.document);
  });
  it('inherits old ribbon and rail colors and keeps new profiles and default scheme independent',()=>{
    const old=normalizeTheme({...defaultTheme,surfaceColors:{black:{ribbon:'#123456',uiText:'#aabbcc'},white:{ribbon:'#abcdef'}}});
    const black=themeTokens(old).surfaces,white=themeTokens({...old,base:'white'}).surfaces;
    expect(black.ribbonTitleBackground).toBe('#123456');expect(black.ribbonTitleText).toBe('#aabbcc');expect(black.ribbonContentText).toBe('#aabbcc');
    expect(black.leftRailBackground).toBe('#252c22');expect(black.rightRailIcon).toBe('#bbc4a6');
    expect(white.ribbonTitleBackground).toBe('#abcdef');expect(white.leftRailBackground).toBe(oliveWhiteSurfaces.leftRailBackground);
    const changed=normalizeTheme({...old,surfaceColors:{...old.surfaceColors,black:{...old.surfaceColors.black,ribbonTitleBackground:'#010203',ribbonTitleText:'#112233',ribbonContentText:'#223344',leftRailBackground:'#334455',leftRailIcon:'#445566',rightRailBackground:'#556677',rightRailIcon:'#667788'}}});
    const saved=readDefaultTheme(JSON.stringify({...old,defaultScheme:changed}));expect(saved).toEqual(changed);
    expect(themeTokens(saved).surfaces).toMatchObject({ribbon:'#123456',ribbonTitleBackground:'#010203',ribbonTitleText:'#112233',ribbonContentText:'#223344',leftRailBackground:'#334455',leftRailIcon:'#445566',rightRailBackground:'#556677',rightRailIcon:'#667788'});
    expect(themeTokens({...saved,base:'white'}).surfaces.ribbonTitleBackground).toBe('#abcdef');
    const values:Record<string,string>={};const root={style:{getPropertyValue:(name:string)=>values[name],setProperty:(name:string,value:string)=>{values[name]=value;}},classList:{toggle:()=>{}}} as unknown as HTMLElement;
    applyThemeTokens(root,saved);expect(values['--hive-ribbon-title-bg']).toBe('#010203');expect(values['--hive-ribbon-content-text']).toBe('#ffffff');expect(values['--hive-left-rail-icon']).toBe('#445566');expect(values['--hive-right-rail-bg']).toBe('#556677');
  });
  it('inherits existing panel border for old themes and persists independent inner colors per base',()=>{
    const old=normalizeTheme({...defaultTheme,surfaceColors:{black:{panelBorder:'#123456'},white:{panelBorder:'#abcdef'}}});
    expect(themeTokens(old).surfaces.panelInnerBorder).toBe('#123456');expect(themeTokens({...old,base:'white'}).surfaces.panelInnerBorder).toBe('#abcdef');
    const changed=normalizeTheme({...old,surfaceColors:{...old.surfaceColors,black:{...old.surfaceColors.black,panelInnerBorder:'#556677'}}});
    const saved=readDefaultTheme(JSON.stringify({defaultScheme:changed}));expect(saved).toEqual(changed);
    expect(themeTokens(saved).surfaces).toMatchObject({panelBorder:'#123456',panelInnerBorder:'#556677'});
    expect(themeTokens({...saved,base:'white'}).surfaces.panelInnerBorder).toBe('#abcdef');
    const values:Record<string,string>={};const root={style:{getPropertyValue:(name:string)=>values[name],setProperty:(name:string,value:string)=>{values[name]=value;}},classList:{toggle:()=>{}}} as unknown as HTMLElement;
    applyThemeTokens(root,saved);expect(values['--hive-panel-inner-border']).toBe('#556677');expect(values['--hive-surface-border']).toBe('#123456');
  });
});
