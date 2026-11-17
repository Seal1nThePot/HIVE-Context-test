import {accentForeground,themeTokens,type ThemePreferences} from './themePreferences';

export function compositeBackground(color:string,parent:string){
  if(color.length!==9)return color.slice(0,7);
  const alpha=parseInt(color.slice(7),16)/255;
  return '#'+[1,3,5].map(i=>Math.round(parseInt(color.slice(i,i+2),16)*alpha+parseInt(parent.slice(i,i+2),16)*(1-alpha)).toString(16).padStart(2,'0')).join('');
}
/** Text follows the active template and explicit surface choices, without contrast overrides. */
export function surfaceTextTokens(theme:ThemePreferences):Record<string,string>{
  const s=themeTokens(theme).surfaces;
  return {'--text':s.uiText,'--muted':s.mutedText,'--hive-document-text':s.documentText,'--hive-titlebar-text':s.uiText,'--hive-header-text':s.uiText,'--hive-ribbon-title-text':s.ribbonTitleText,'--hive-ribbon-content-text':s.ribbonContentText,'--hive-settings-text':s.uiText,'--hive-settings-sidebar-text':s.uiText,'--hive-settings-card-text':s.uiText,'--hive-input-text':s.uiText,'--hive-popup-text':s.uiText,'--hive-selection-text':s.uiText,'--hive-raised-text':s.uiText,'--hive-on-accent':accentForeground(theme.colors.accent)};
}
