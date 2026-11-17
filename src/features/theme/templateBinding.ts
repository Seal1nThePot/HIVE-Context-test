import {colorRoles,normalizeTheme,type BaseColor,type ThemePreferences} from './themePreferences';
import {surfaceColorGroups} from './surfaceAppearance';
import oliveDefaults from '../../../templates/olive-gold/colors.json';

export type TemplateIdentity={id:string;name:string;bases:BaseColor[]};
export type TemplateBinding=TemplateIdentity&{defaults:ThemePreferences};
export type ThemePatch=Record<string,unknown>;
export type TemplateUserProfile={base:BaseColor;changes:ThemePatch;defaultBase:BaseColor;defaultChanges:ThemePatch};
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const hex=(value:unknown)=>typeof value==='string'&&/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value);
export function mergeThemePatch(original:unknown,patch:unknown):unknown{
  if(!object(original)||!object(patch))return patch;
  const result:Record<string,unknown>={...original};for(const key of Object.keys(patch))if(!['__proto__','constructor','prototype'].includes(key))result[key]=mergeThemePatch(original[key],patch[key]);return result;
}
export function themeDifference(original:unknown,value:unknown):ThemePatch{
  const result:ThemePatch={};if(!object(original)||!object(value))return result;
  for(const key of Object.keys(value)){
    if(JSON.stringify(original[key])===JSON.stringify(value[key]))continue;
    result[key]=object(original[key])&&object(value[key])?themeDifference(original[key],value[key]):value[key];
  }return result;
}
function safeOverlay(reference:unknown,value:unknown):unknown{
  if(object(reference)){const result:Record<string,unknown>={};for(const key of Object.keys(reference))result[key]=safeOverlay(reference[key],object(value)?value[key]:undefined);return result;}
  if(typeof reference==='number')return typeof value==='number'&&Number.isFinite(value)?value:reference;
  if(reference==='accent')return value==='accent'||hex(value)?value:reference;
  if(typeof reference==='string'&&reference.startsWith('#'))return hex(value)&&(reference.length===9||typeof value==='string'&&value.length===7)?value:reference;
  return value===undefined?reference:value;
}
export function createTemplateBinding(identity:TemplateIdentity,raw:unknown):TemplateBinding{
  if(typeof identity.id!=='string'||!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(identity.id)||typeof identity.name!=='string'||!Array.isArray(identity.bases))throw new Error('模板身份声明无效。');
  const bases=identity.bases.filter((base,index,all)=>['black','gray','white','custom'].includes(base)&&all.indexOf(base)===index);
  if(!bases.length)throw new Error('当前模板没有声明可用的基础颜色。');
  const supplied=object(raw)?raw:{};
  if(identity.id!=='olive-gold')for(const base of bases){const profiles=object(supplied.colorProfiles)?supplied.colorProfiles:{},entry=profiles[base];if(!object(entry)||colorRoles.some(role=>typeof entry[role]!=='string'||!/^#[0-9a-f]{6}$/i.test(entry[role] as string)))throw new Error(`${identity.name}的${base}语义色不完整，不能回退到其他模板。`);}
  const defaults=normalizeTheme(identity.id==='olive-gold'?mergeThemePatch(oliveDefaults,supplied):supplied);
  const surfaceKeys=surfaceColorGroups.flatMap(group=>group.fields.map(([key])=>key));
  for(const base of bases){
    const colors=defaults.colorProfiles[base],surfaces=defaults.surfaceColors[base],dock=defaults.writingDockProfiles[base];
    if(!colors||!surfaces||!dock||surfaceKeys.some(key=>!hex(surfaces[key])))throw new Error(`${identity.name}的${base}基础配色不完整，已保留上一份有效配色。`);
  }
  return {...identity,bases,defaults};
}
export function allowedTemplateBase(binding:TemplateBinding,base:BaseColor){return binding.bases.includes(base)?base:binding.bases.includes(binding.defaults.base)?binding.defaults.base:binding.bases[0];}
export function templateBaseDefaults(binding:TemplateBinding,requested:BaseColor):ThemePreferences{
  const base=allowedTemplateBase(binding,requested),defaults=binding.defaults;
  const colorProfiles=Object.fromEntries(binding.bases.map(name=>[name,{...defaults.colorProfiles[name]}]));
  const surfaceColors=Object.fromEntries(binding.bases.map(name=>[name,{...defaults.surfaceColors[name]}]));
  const writingDockProfiles=Object.fromEntries(binding.bases.map(name=>[name,structuredClone(defaults.writingDockProfiles[name])]));
  return normalizeTheme({...defaults,base,editorProfiles:Object.fromEntries(binding.bases.filter(name=>defaults.editorProfiles[name]).map(name=>[name,defaults.editorProfiles[name]])),dockingProfiles:Object.fromEntries(binding.bases.filter(name=>defaults.dockingProfiles[name]).map(name=>[name,defaults.dockingProfiles[name]])),colorProfiles,surfaceColors,writingDockProfiles,colors:colorProfiles[base],writingDock:writingDockProfiles[base]});
}
export function normalizeWithinTemplate(value:ThemePreferences,binding:TemplateBinding):ThemePreferences{
  const base=allowedTemplateBase(binding,value.base),reference=templateBaseDefaults(binding,base);
  const colors=Object.fromEntries(binding.bases.map(name=>[name,safeOverlay(reference.colorProfiles[name],value.colorProfiles[name])]));
  const surfaces=Object.fromEntries(binding.bases.map(name=>[name,safeOverlay(reference.surfaceColors[name],value.surfaceColors[name])]));
  const docks=Object.fromEntries(binding.bases.map(name=>[name,safeOverlay(reference.writingDockProfiles[name],value.writingDockProfiles[name])]));
  return normalizeTheme({...value,base,editorProfiles:Object.fromEntries(binding.bases.filter(name=>value.editorProfiles?.[name]).map(name=>[name,value.editorProfiles[name]])),dockingProfiles:Object.fromEntries(binding.bases.filter(name=>value.dockingProfiles?.[name]).map(name=>[name,value.dockingProfiles[name]])),colorProfiles:colors,surfaceColors:surfaces,writingDockProfiles:docks,colors:colors[base],writingDock:docks[base]});
}
export function userProfileFor(binding:TemplateBinding,preferences:ThemePreferences,defaultScheme:ThemePreferences):TemplateUserProfile{
  const current=normalizeWithinTemplate(preferences,binding),saved=normalizeWithinTemplate(defaultScheme,binding);
  return {base:current.base,changes:themeDifference(templateBaseDefaults(binding,current.base),current),defaultBase:saved.base,defaultChanges:structuredClone(saved) as unknown as ThemePatch};
}
export function applyUserProfile(binding:TemplateBinding,profile?:TemplateUserProfile){
  const current=templateBaseDefaults(binding,profile?.base??binding.defaults.base),saved=templateBaseDefaults(binding,profile?.defaultBase??current.base);
  let defaultScheme=mergeThemePatch(saved,profile?.defaultChanges??{}) as ThemePreferences;
  // A saved full default is a snapshot: an empty override map means "derive
  // from those saved surfaces", rather than inheriting later template overrides.
  if(profile?.defaultChanges.version===1){const savedTheme=normalizeTheme(profile.defaultChanges);defaultScheme={...defaultScheme,dockingProfiles:savedTheme.dockingProfiles,editorProfiles:savedTheme.editorProfiles};}
  return {preferences:normalizeWithinTemplate(mergeThemePatch(current,profile?.changes??{}) as ThemePreferences,binding),defaultScheme:normalizeWithinTemplate(defaultScheme,binding)};
}
