import {describe,expect,it} from 'vitest';
import {brightness,colorRoles,defaultTheme,mix,normalizeTheme,readDefaultTheme,readTheme,resetThemeBase,rgb,switchThemeBase,themeTokens,updateThemeColors} from './themePreferences';
import {oliveGrayColors,oliveGraySurfaces,oliveGrayWritingDock,oliveWhiteColors,oliveWhiteSurfaces,oliveWhiteWritingDock} from './oliveGoldBuiltins';
import {surfaceColorGroups} from './surfaceAppearance';

function contrast(a:string,b:string){
  const luminance=(hex:string)=>{const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
  const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}

describe('青苔鎏金 light variants',()=>{
  it('provides complete independent light gray and paper white surfaces and docks at runtime',()=>{
    const roles=surfaceColorGroups.flatMap(group=>group.fields.map(([role])=>role));expect(roles).toHaveLength(29);
    for(const [base,colors,surfaces,dock] of [['gray',oliveGrayColors,oliveGraySurfaces,oliveGrayWritingDock],['white',oliveWhiteColors,oliveWhiteSurfaces,oliveWhiteWritingDock]] as const){
      const theme=switchThemeBase(defaultTheme,base),resolved=themeTokens(theme).surfaces;
      expect(theme.colors).toEqual(colors);expect(resolved).toEqual(surfaces);expect(theme.writingDock).toEqual(dock);
      expect(Object.keys(resolved).sort()).toEqual([...roles].sort());
      expect(resolved.ribbonTitleBackground).not.toBe(resolved.ribbon);expect(resolved.panelInnerBorder).not.toBe(resolved.panelBorder);
      expect(resolved.leftRailBackground).toBe(resolved.rightRailBackground);expect(resolved.popup).not.toBe(resolved.panel);
    }
    expect(oliveGraySurfaces.document).not.toBe(oliveWhiteSurfaces.document);
  });
  it('keeps semantic colors and small interface labels readable on light backgrounds',()=>{
    for(const [colors,s] of [[oliveGrayColors,oliveGraySurfaces],[oliveWhiteColors,oliveWhiteSurfaces]] as const){
      for(const role of colorRoles)for(const background of [s.document,s.panel,s.panelHeader,s.popup,s.selection])expect(contrast(colors[role],background),`${role} on ${background}`).toBeGreaterThanOrEqual(4.5);
      for(const [foreground,background] of [[s.documentText,s.document],[s.uiText,s.panel],[s.mutedText,s.panel],[s.mutedText,s.popup],[s.ribbonTitleText,s.ribbonTitleBackground],[s.ribbonContentText,s.ribbon],[s.leftRailIcon,s.leftRailBackground],[s.rightRailIcon,s.rightRailBackground]])expect(contrast(foreground,background)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('separates the gray reading canvas, tools, headers and interaction states by broad color areas',()=>{
    const s=oliveGraySurfaces,gray=switchThemeBase(defaultTheme,'gray');
    expect(brightness(s.document)-brightness(s.panel)).toBeGreaterThanOrEqual(38);
    expect(brightness(s.panel)-brightness(s.panelHeader)).toBeGreaterThanOrEqual(18);
    expect(brightness(s.ribbon)-brightness(s.ribbonTitleBackground)).toBeGreaterThanOrEqual(45);
    expect(brightness(s.panel)-brightness(s.leftRailBackground)).toBeGreaterThanOrEqual(28);
    expect(brightness(s.selectedTab)-brightness(s.panelHeader)).toBeGreaterThanOrEqual(55);
    expect(s.selectedTab).toBe(s.document);
    // The page is a neutral warm gray; olive belongs to the surrounding tools.
    const [r,g,b]=rgb(s.document);expect(g).toBeLessThanOrEqual(r);expect(Math.max(r,g,b)-Math.min(r,g,b)).toBeLessThanOrEqual(10);
    const hover=mix(s.panel,themeTokens(gray).accent,32/255);
    expect(brightness(s.selection)-brightness(hover)).toBeGreaterThanOrEqual(25);
    const [selectedRed,,selectedBlue]=rgb(s.selection);expect(selectedRed-selectedBlue).toBeGreaterThanOrEqual(35);
    const dock=oliveGrayWritingDock;
    expect(brightness(s.document)-brightness(dock.frame.background)).toBeGreaterThanOrEqual(40);
    expect(brightness(dock.sideButtons.activeBackground)-brightness(dock.sideButtons.hoverBackground)).toBeGreaterThanOrEqual(25);
    expect(contrast(dock.sideButtons.icon,dock.frame.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dock.sideButtons.activeIcon,dock.sideButtons.activeBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dock.sideButtons.hoverIcon,dock.sideButtons.hoverBackground)).toBeGreaterThanOrEqual(4.5);
    expect([dock.frame.borderWidth,dock.aiButton.borderWidth,dock.sideButtons.borderWidth]).toEqual([1,1,1]);
  });
  it('archives legacy black colors once without changing custom surfaces or translucent dock colors',()=>{
    const legacy={version:1,base:'black',palette:'hive',colors:{...defaultTheme.colors,accent:'#bfb178'},surfaceColors:{black:{document:'#262c25',ribbonBorder:'#343c2d'}},writingDock:{...defaultTheme.writingDock,frame:{...defaultTheme.writingDock.frame,background:'#27301fff',shadow:'#00000047'},aiButton:{...defaultTheme.writingDock.aiButton,icon:'#27301f'}}};
    const black=normalizeTheme(legacy),gray=switchThemeBase(black,'gray'),white=switchThemeBase(gray,'white'),restored=switchThemeBase(white,'black');
    expect(gray.colors).toEqual(oliveGrayColors);expect(white.colors).toEqual(oliveWhiteColors);
    expect(restored.colors).toEqual(legacy.colors);expect(restored.colorProfiles.black).toEqual(legacy.colors);
    expect(restored.surfaceColors.black).toEqual(legacy.surfaceColors.black);expect(restored.writingDock).toEqual(black.writingDock);
    expect(restored.writingDock.aiButton.icon).toBe('#27301f');expect(restored.writingDock.frame.shadow).toBe('#00000047');
    expect(readTheme(JSON.stringify(restored))).toEqual(restored);
  });
  it('recovers saved legacy black gold when the first upgraded launch is on gray',()=>{
    const colors={...defaultTheme.colors,accent:'#bfb178'},blackDock={...defaultTheme.writingDock,aiButton:{...defaultTheme.writingDock.aiButton,icon:'#27301f'}};
    const envelope={version:1,base:'gray',palette:'hive',colors,writingDockProfiles:{black:blackDock},defaultScheme:{version:1,base:'black',palette:'hive',colors}};
    for(const migrated of [normalizeTheme(envelope),readTheme(JSON.stringify(envelope))]){
      expect(migrated.base).toBe('gray');expect(migrated.colors).toEqual(colors);expect(migrated.colorProfiles.black).toEqual(colors);
      const black=switchThemeBase(migrated,'black');expect(black.colors.accent).toBe('#bfb178');expect(black.writingDock.aiButton.icon).toBe('#27301f');
      expect(switchThemeBase(black,'white').colors).toEqual(oliveWhiteColors);
      expect(readTheme(JSON.stringify(migrated))).toEqual(migrated);
    }
  });
  it('fills only missing saved archives and leaves current edits and explicit profiles authoritative',()=>{
    const grayColors={...oliveGrayColors,accent:'#554422'},blackColors={...defaultTheme.colors,accent:'#112233'},whiteColors={...oliveWhiteColors,link:'#654321'};
    const migrated=normalizeTheme({version:1,base:'gray',palette:'hive',colors:grayColors,colorProfiles:{black:blackColors},defaultScheme:{version:1,base:'gray',palette:'hive',colors:{accent:'#ffffff'},colorProfiles:{black:{accent:'#bfb178'},white:whiteColors,gray:{accent:'#ffffff'}}}});
    expect(migrated.colors).toEqual(grayColors);expect(migrated.colorProfiles.gray).toBeUndefined();
    expect(switchThemeBase(migrated,'black').colors).toEqual(blackColors);expect(switchThemeBase(migrated,'white').colors).toEqual(whiteColors);
  });
  it('does not guess black ownership without a valid saved default or import retired colors',()=>{
    for(const defaultScheme of [undefined,{version:2,base:'black',colors:{accent:'#bfb178'}},{version:1,base:'black',palette:'ocean',colors:{accent:'#bfb178'}},{version:1,base:'black',colors:{accent:'url(x)'}}]){
      const migrated=normalizeTheme({version:1,base:'gray',palette:'hive',colors:{...defaultTheme.colors,accent:'#bfb178'},defaultScheme});
      expect(migrated.colorProfiles.black).toBeUndefined();expect(switchThemeBase(migrated,'black').colors).toEqual(defaultTheme.colors);
    }
  });
  it('restores all three groups separately after editing and saving different bases',()=>{
    const black=updateThemeColors(defaultTheme,{accent:'#bfb178'});
    let gray=updateThemeColors(switchThemeBase(black,'gray'),{accent:'#665522',danger:'#883322'});
    gray={...gray,surfaceColors:{...gray.surfaceColors,gray:{document:'#dde3d1',popup:'#eef3e4'}},writingDock:{...gray.writingDock,frame:{...gray.writingDock.frame,background:'#cad0c2f2'}}};
    const white=updateThemeColors(switchThemeBase(gray,'white'),{link:'#665522'}),stored=readDefaultTheme(JSON.stringify({defaultScheme:white}));
    const restored=switchThemeBase(stored,'gray');
    expect(restored.colors.accent).toBe('#665522');expect(restored.colors.danger).toBe('#883322');expect(restored.surfaceColors.gray).toEqual(gray.surfaceColors.gray);expect(restored.writingDock.frame.background).toBe('#cad0c2f2');
    expect(switchThemeBase(restored,'black').colors.accent).toBe('#bfb178');expect(switchThemeBase(restored,'white').colors.link).toBe('#665522');
    expect(defaultTheme.colorProfiles).toEqual({});expect(defaultTheme.colors.accent).toBe('#c3b57d');
  });
  it('validates base-scoped semantic palettes and uses the active stored profile',()=>{
    const theme=normalizeTheme({version:1,base:'white',colors:{accent:'#ffffff'},colorProfiles:{white:{accent:'#ABCDEF',link:'url(x)',danger:'#fff',unknown:'#123456'},gray:[],other:{accent:'#123456'}}});
    expect(theme.colors).toEqual({...oliveWhiteColors,accent:'#abcdef'});expect(theme.colorProfiles).toEqual({white:theme.colors});
    expect(switchThemeBase(theme,'gray').colors).toEqual(oliveGrayColors);
    expect(normalizeTheme({version:1,base:'gray',colorProfiles:null,colors:{accent:'#123456'}}).colors.accent).toBe('#123456');
  });
  it('resets the current base without discarding another base customization',()=>{
    let gray=updateThemeColors(switchThemeBase(updateThemeColors(defaultTheme,{accent:'#bfb178'}),'gray'),{accent:'#111111'});
    gray={...gray,surfaceColors:{black:{document:'#283124'},gray:{document:'#112233'}},writingDock:{...gray.writingDock,frame:{...gray.writingDock.frame,background:'#abcdef99'}}};
    const reset=resetThemeBase(gray);
    expect(reset.colors).toEqual(oliveGrayColors);expect(themeTokens(reset).surfaces).toEqual(oliveGraySurfaces);expect(reset.writingDock).toEqual(oliveGrayWritingDock);
    expect(reset.surfaceColors.black).toEqual({document:'#283124'});expect(switchThemeBase(reset,'black').colors.accent).toBe('#bfb178');
  });
});
