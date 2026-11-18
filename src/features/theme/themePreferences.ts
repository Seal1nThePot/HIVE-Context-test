import {normalizeReasoningEffects,type ReasoningEffects} from '../chat/reasoningEffects';
import {normalizeDockingProfiles,type DockingProfiles} from './dockingAppearance';
import {normalizeEditorProfiles,type EditorProfiles} from './editorAppearance';
import {defaultWritingDock,normalizeWritingDock,type WritingDockAppearance} from '../chat/writingDockAppearance';
import {normalizeSurfaceProfiles,resolveSurfaceColors,type SurfaceProfiles} from './surfaceAppearance';
import {oliveGrayColors,oliveGrayWritingDock,oliveWhiteColors,oliveWhiteWritingDock} from './oliveGoldBuiltins';

export const themeStorageKey='hive.theme.v1';
export const colorRoles=['accent','secondary','link','success','warning','danger'] as const;
export type ColorRole=typeof colorRoles[number];
export type Palette=Record<ColorRole,string>;
export const palettes={
  hive:{label:'青苔鎏金',colors:{accent:'#c3b57d',secondary:'#98ac89',link:'#d3bd80',success:'#86b993',warning:'#d0aa69',danger:'#d68d82'}},
} satisfies Record<string,{label:string;colors:Palette}>;
export type PaletteId=keyof typeof palettes;
export type BaseColor='black'|'white'|'gray'|'custom';
export type ColorProfiles=Partial<Record<BaseColor,Palette>>;
export type ThemeCorePreferences={version:1;base:BaseColor;customBase:string;palette:PaletteId;colors:Palette;colorProfiles:ColorProfiles;surfaceContrastMode:'auto'|'manual';surfaceContrast:number;surfaceColors:SurfaceProfiles};
export type ReasoningTrackColors={left:string;middle:string;right:string};
export type ReasoningTrackProfiles=Partial<Record<BaseColor,ReasoningTrackColors>>;
export type WritingDockProfiles=Partial<Record<BaseColor,WritingDockAppearance>>;
export type ComposerShadow={color:string;blur:number;offsetY:number};
export const defaultComposerShadow:ComposerShadow={color:'#00000066',blur:14,offsetY:4};
export type ThemePreferences=ThemeCorePreferences&{writingDock:WritingDockAppearance;writingDockProfiles:WritingDockProfiles;dockingProfiles:DockingProfiles;editorProfiles:EditorProfiles;reasoningEffects?:ReasoningEffects;reasoningTrackProfiles?:ReasoningTrackProfiles;composerShadow:ComposerShadow};
export const defaultTheme:ThemePreferences={version:1,base:'black',customBase:'#202820',palette:'hive',colors:{...palettes.hive.colors},colorProfiles:{},surfaceContrastMode:'auto',surfaceContrast:100,surfaceColors:{},writingDock:defaultWritingDock,writingDockProfiles:{},dockingProfiles:{},editorProfiles:{},composerShadow:defaultComposerShadow};
export function isHex(value:unknown):value is string{return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);}
export function normalizeComposerShadow(value:unknown):ComposerShadow{
  const raw=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  const clamp=(input:unknown,min:number,max:number,fallback:number)=>typeof input==='number'&&Number.isFinite(input)?Math.round(Math.max(min,Math.min(max,input))):fallback;
  const color=typeof raw.color==='string'&&/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(raw.color)?raw.color.toLowerCase():defaultComposerShadow.color;
  return {color,blur:clamp(raw.blur,0,40,defaultComposerShadow.blur),offsetY:clamp(raw.offsetY,0,24,defaultComposerShadow.offsetY)};
}
export function composerShadowCss(value:ComposerShadow){return `0 ${value.offsetY}px ${value.blur}px ${value.color}`;}
export function defaultColorsForBase(base:BaseColor):Palette{return {...(base==='gray'?oliveGrayColors:base==='white'?oliveWhiteColors:palettes.hive.colors)};}
function normalizeReasoningTrackProfiles(value:unknown):ReasoningTrackProfiles{
  const result:ReasoningTrackProfiles={},raw=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  for(const base of ['black','white','gray','custom'] as const){const entry=raw[base];if(!entry||typeof entry!=='object'||Array.isArray(entry))continue;const v=entry as Record<string,unknown>;if(isHex(v.left)&&isHex(v.middle)&&isHex(v.right))result[base]={left:v.left.toLowerCase(),middle:v.middle.toLowerCase(),right:v.right.toLowerCase()};}return result;
}
function normalizePalette(value:unknown,base:BaseColor):Palette{
  const raw=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{},colors=defaultColorsForBase(base);
  for(const role of colorRoles)if(isHex(raw[role]))colors[role]=raw[role].toLowerCase();
  return colors;
}
function savedDefaultColorProfiles(value:unknown):ColorProfiles{
  const saved=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{},profiles:ColorProfiles={};
  if(saved.version!==1||(typeof saved.palette==='string'&&!Object.hasOwn(palettes,saved.palette)))return profiles;
  const rawProfiles=saved.colorProfiles&&typeof saved.colorProfiles==='object'&&!Array.isArray(saved.colorProfiles)?saved.colorProfiles as Record<string,unknown>:{};
  for(const name of ['black','white','gray','custom'] as const){const entry=rawProfiles[name];if(entry&&typeof entry==='object'&&!Array.isArray(entry))profiles[name]=normalizePalette(entry,name);}
  const base=(['black','white','gray','custom'] as unknown[]).includes(saved.base)?saved.base as BaseColor:undefined;
  const rawColors=saved.colors&&typeof saved.colors==='object'&&!Array.isArray(saved.colors)?saved.colors as Record<string,unknown>:{};
  // A saved legacy default is evidence of the base that owned its global colors.
  // Do not infer an archive from a default that contains no valid color at all.
  if(base&&!profiles[base]&&colorRoles.some(role=>isHex(rawColors[role])))profiles[base]=normalizePalette(rawColors,base);
  return profiles;
}
export function normalizeTheme(value:unknown):ThemePreferences {
  const v=value&&typeof value==='object'?value as Record<string,unknown>:{};
  if(v.version!==1)return {...defaultTheme,colors:{...defaultTheme.colors},colorProfiles:{},surfaceColors:{},writingDock:normalizeWritingDock(null),writingDockProfiles:{},dockingProfiles:{},editorProfiles:{},composerShadow:normalizeComposerShadow(null)};
  const base=(['black','white','gray','custom'] as unknown[]).includes(v.base)?v.base as BaseColor:'black';
  const palette=typeof v.palette==='string'&&Object.hasOwn(palettes,v.palette)?v.palette as PaletteId:'hive';
  // Retired presets must not reappear under the remaining preset's name.
  const retired=typeof v.palette==='string'&&!Object.hasOwn(palettes,v.palette);
  const colorProfiles:ColorProfiles={},hasColorProfiles=!!v.colorProfiles&&typeof v.colorProfiles==='object'&&!Array.isArray(v.colorProfiles);
  if(hasColorProfiles&&!retired)for(const name of ['black','white','gray','custom'] as const){const entry=(v.colorProfiles as Record<string,unknown>)[name];if(entry&&typeof entry==='object'&&!Array.isArray(entry))colorProfiles[name]=normalizePalette(entry,name);}
  const colors=colorProfiles[base]??normalizePalette(retired?null:v.colors,base);
  // A legacy global palette belongs to its original base only. Switching later
  // uses the destination's own defaults rather than copying dark gold onto paper.
  if(!hasColorProfiles&&!retired)colorProfiles[base]={...colors};
  // Old releases could switch the global colors to gray while a saved black
  // default still held the user's gold adjustments. Recover only missing,
  // inactive archives; current edits and explicit profiles always win.
  if(!retired){const savedProfiles=savedDefaultColorProfiles(v.defaultScheme);for(const name of ['black','white','gray','custom'] as const)if(name!==base&&!colorProfiles[name]&&savedProfiles[name])colorProfiles[name]=savedProfiles[name];}
  const surfaceContrastMode=v.surfaceContrastMode==='manual'?'manual':'auto';
  const surfaceContrast=typeof v.surfaceContrast==='number'&&Number.isFinite(v.surfaceContrast)?Math.round(Math.max(50,Math.min(150,v.surfaceContrast))):100;
  const core:ThemeCorePreferences={version:1,base,customBase:isHex(v.customBase)?v.customBase.toLowerCase():defaultTheme.customBase,palette,colors,colorProfiles,surfaceContrastMode,surfaceContrast,surfaceColors:normalizeSurfaceProfiles(v.surfaceColors)};
  const profiles:WritingDockProfiles={};
  if(v.writingDockProfiles&&typeof v.writingDockProfiles==='object'&&!Array.isArray(v.writingDockProfiles)){
    for(const name of ['black','white','gray','custom'] as const){const entry=(v.writingDockProfiles as Record<string,unknown>)[name];if(entry&&typeof entry==='object'&&!Array.isArray(entry))profiles[name]=normalizeWritingDock(entry);}
  }else if(v.writingDock&&typeof v.writingDock==='object'&&!Array.isArray(v.writingDock)){
    // Old releases could leave their dark olive/black dock attached to a light base.
    // Keep those exact colors under black and let the light base use its own default.
    const dock=v.writingDock as Record<string,unknown>,frame=dock.frame&&typeof dock.frame==='object'?dock.frame as Record<string,unknown>:{};
    const background=typeof frame.background==='string'&&/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(frame.background)?frame.background.slice(0,7):'';
    const [r,g,b]=background?rgb(background):[255,0,255];
    const misplacedDark=(base==='white'||base==='gray')&&!!background&&brightness(background)<=72&&r<=g+20&&b<=g+20;
    const destination=misplacedDark?'black':base;
    profiles[destination]=normalizeWritingDock(v.writingDock,destination==='black'?color=>color:color=>mapLegacyColor(color,core));
  }
  return {...core,...(v.reasoningTrackProfiles?{reasoningTrackProfiles:normalizeReasoningTrackProfiles(v.reasoningTrackProfiles)}:{}),...(v.reasoningEffects?{reasoningEffects:normalizeReasoningEffects(v.reasoningEffects)}:{}),dockingProfiles:normalizeDockingProfiles(v.dockingProfiles),editorProfiles:normalizeEditorProfiles(v.editorProfiles),writingDockProfiles:profiles,writingDock:profiles[base]??defaultDockForTheme(core),composerShadow:normalizeComposerShadow(v.composerShadow)};
}
export function defaultDockForTheme(theme:ThemeCorePreferences):WritingDockAppearance{
  if(theme.base==='black')return normalizeWritingDock(defaultWritingDock);
  if(theme.base==='gray')return normalizeWritingDock(oliveGrayWritingDock);
  if(theme.base==='white')return normalizeWritingDock(oliveWhiteWritingDock);
  const {surfaces}=themeTokens(theme),foreground=accentForeground(theme.colors.accent);
  return {frame:{...defaultWritingDock.frame,background:surfaces.panelHeader+'f2',border:surfaces.panelBorder},
    aiButton:{...defaultWritingDock.aiButton,icon:foreground,hoverIcon:foreground,border:foreground},
    sideButtons:{...defaultWritingDock.sideButtons,icon:surfaces.uiText,activeIcon:surfaces.uiText,activeBackground:surfaces.selection,activeBorder:surfaces.panelBorder,hoverIcon:surfaces.uiText,hoverBackground:surfaces.selection}};
}
/** Switch all base-scoped color groups together, preserving the source exactly. */
export function switchThemeBase(theme:ThemePreferences,base:BaseColor):ThemePreferences{
  const source=normalizeTheme({...theme,colorProfiles:{...theme.colorProfiles,[theme.base]:theme.colors},writingDockProfiles:{...theme.writingDockProfiles,[theme.base]:theme.writingDock}});
  return normalizeTheme({...source,base,colors:source.colorProfiles[base]??defaultColorsForBase(base)});
}
/** Keep the active palette and its stored profile in sync during color previews. */
export function updateThemeColors(theme:ThemePreferences,patch:Partial<Palette>):ThemePreferences{
  const colors=normalizePalette({...theme.colors,...patch},theme.base);
  return normalizeTheme({...theme,colors,colorProfiles:{...theme.colorProfiles,[theme.base]:colors}});
}
/** Restore one base only; other base-specific customizations remain available. */
export function resetThemeBase(theme:ThemePreferences):ThemePreferences{
  const surfaceColors={...theme.surfaceColors},writingDockProfiles={...theme.writingDockProfiles},dockingProfiles={...theme.dockingProfiles},editorProfiles={...theme.editorProfiles};
  delete surfaceColors[theme.base];delete writingDockProfiles[theme.base];delete dockingProfiles[theme.base];delete editorProfiles[theme.base];
  return normalizeTheme({...theme,colors:defaultColorsForBase(theme.base),colorProfiles:{...theme.colorProfiles,[theme.base]:defaultColorsForBase(theme.base)},surfaceColors,writingDock:undefined,writingDockProfiles,dockingProfiles,editorProfiles});
}
export function readTheme(value:string|null):ThemePreferences{try{return normalizeTheme(JSON.parse(value||'null'));}catch{return normalizeTheme(null);}}
export function readDefaultTheme(value:string|null):ThemePreferences{try{return normalizeTheme(JSON.parse(value||'null')?.defaultScheme);}catch{return normalizeTheme(null);}}
export function rgb(hex:string){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
export function brightness(hex:string){const [r,g,b]=rgb(hex);return (r*299+g*587+b*114)/1000;}
export function accentForeground(hex:string){
  const linear=rgb(hex).map(value=>{const channel=value/255;return channel<=0.04045?channel/12.92:((channel+0.055)/1.055)**2.4;});
  const luminance=linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
  return (luminance+.05)/.05 >= 1.05/(luminance+.05)?'#000000':'#ffffff';
}
export function mix(a:string,b:string,amount:number){const x=rgb(a),y=rgb(b);return '#'+x.map((v,i)=>Math.round(v*(1-amount)+y[i]*amount).toString(16).padStart(2,'0')).join('');}
export function themeTokens(theme:ThemeCorePreferences){
  const base=theme.base==='white'?'#ffffff':theme.base==='gray'?'#e4e7e4':theme.base==='custom'?theme.customBase:'#171918';
  const light=brightness(base)>145;
  const strength=theme.surfaceContrastMode==='manual'?theme.surfaceContrast/100:1;
  const surfaces=resolveSurfaceColors(theme.base,theme.customBase,strength,theme.surfaceColors);
  const foreground=surfaces.uiText,muted=surfaces.mutedText,panel=surfaces.panel,panel2=surfaces.popup,line=surfaces.panelBorder;
  const accent=light?mix(theme.colors.accent,'#000000',.35):theme.colors.accent;
  const token={base,panel,panel2,line,muted,foreground,accent,light,surfaces,workspaceSurface:surfaces.workspace,documentSurface:surfaces.document,panelSurface:surfaces.panel,headerSurface:surfaces.panelHeader,raisedSurface:surfaces.selectedTab,borderSurface:surfaces.panelBorder,rawAccent:theme.colors.accent,onAccent:accentForeground(theme.colors.accent)};
  if(theme.base==='custom'){
    const explicit=theme.surfaceColors[theme.base];
    for(const role of ['leftRailBackground','rightRailBackground'] as const)if(!explicit?.[role])surfaces[role]=mapColorWithTokens('#252c22',theme,token);
    for(const role of ['leftRailIcon','rightRailIcon'] as const)if(!explicit?.[role])surfaces[role]=mapColorWithTokens('#bbc4a6',theme,token);
  }
  return token;
}
export function mapLegacyColor(original:string,theme:ThemeCorePreferences){
  return mapColorWithTokens(original,theme,themeTokens(theme));
}
function mapColorWithTokens(original:string,theme:ThemeCorePreferences,token:{base:string;light:boolean;accent:string;foreground:string;muted:string}){
  const [r,g,b]=rgb(original),lum=brightness(original),spread=Math.max(r,g,b)-Math.min(r,g,b);let mapped:string;
  if(spread>35&&lum>85&&r>g*1.08&&g>b*1.1)mapped=lum>190?mix(token.accent,token.foreground,.22):token.accent;
  else if(spread>45&&r>g*1.3&&r>b*1.15)mapped=theme.colors.danger;
  else if(lum<85)mapped=mix(token.base,token.light?'#000000':'#ffffff',Math.min(.24,lum/400));
  else if(lum<155)mapped=mix(token.muted,token.base,(155-lum)/150);
  else mapped=mix(token.foreground,token.base,Math.max(0,(235-lum)/420));
  return mapped+original.slice(7);
}
