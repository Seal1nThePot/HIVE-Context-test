import schema from '../../../desktop/docking-colors.json';
import {accentForeground,themeTokens,type BaseColor,type ThemePreferences} from './themePreferences';

export const dockingColorFields=schema;
export type DockingColorRole=keyof typeof schema;
export type DockingColors=Record<DockingColorRole,string>;
export type DockingProfiles=Partial<Record<BaseColor,Partial<DockingColors>>>;
export const dockingVariable=(key:DockingColorRole)=>'--hive-dock-'+key.replace(/[A-Z]/g,value=>'-'+value.toLowerCase());

export function normalizeDockingProfiles(value:unknown):DockingProfiles{
  const result:DockingProfiles={};if(!value||typeof value!=='object'||Array.isArray(value))return result;
  for(const base of ['black','gray','white','custom'] as const){
    const raw=(value as Record<string,unknown>)[base];if(!raw||typeof raw!=='object'||Array.isArray(raw))continue;
    const colors:Partial<DockingColors>={};
    for(const key of Object.keys(schema) as DockingColorRole[]){const color=(raw as Record<string,unknown>)[key];if(typeof color==='string'&&(schema[key].alpha?/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i:/^#[0-9a-f]{6}$/i).test(color))colors[key]=color.toLowerCase();}
    if(Object.keys(colors).length)result[base]=colors;
  }
  return result;
}
const cache=new WeakMap<ThemePreferences,DockingColors>();
/** Older templates inherit their own surfaces; no new required template fields. */
export function dockingColors(theme:ThemePreferences):DockingColors{
  const cached=cache.get(theme);if(cached)return cached;
  const s=themeTokens(theme).surfaces,accent=theme.colors.accent;
  const colors:DockingColors={
    guideBackground:s.popup+'f2',guideIcon:accentForeground(s.popup),guideBorder:s.popupBorder,
    activeBackground:s.selection+'f5',activeIcon:accentForeground(s.selection),activeBorder:accent,
    regionBackground:accent+'06',regionBorder:accent+'4d',previewBackground:accent+'26',previewBorder:accent,
    railBackground:accent+'18',railActiveBackground:accent+'77',railBorder:accent+'99',
    ghostBackground:s.popup+'f2',ghostIcon:accentForeground(s.popup),ghostOutline:accent,
    hintBackground:s.popup+'f2',hintText:accentForeground(s.popup),hintBorder:s.popupBorder,
    pullBackground:accent+'30',pullReadyBackground:accent+'50',shadow:'#00000066',
    ...theme.dockingProfiles?.[theme.base],
  };
  cache.set(theme,colors);return colors;
}
export function dockingTokens(theme:ThemePreferences){return Object.fromEntries((Object.entries(dockingColors(theme)) as [DockingColorRole,string][]).map(([key,color])=>[dockingVariable(key),color]));}
