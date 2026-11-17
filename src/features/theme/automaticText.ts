import {accentForeground,themeTokens,type ThemePreferences} from './themePreferences';

export function compositeBackground(color:string,parent:string){
  if(color.length!==9)return color.slice(0,7);
  const alpha=parseInt(color.slice(7),16)/255;
  return '#'+[1,3,5].map(i=>Math.round(parseInt(color.slice(i,i+2),16)*alpha+parseInt(parent.slice(i,i+2),16)*(1-alpha)).toString(16).padStart(2,'0')).join('');
}
export function automaticTextTokens(theme:ThemePreferences):Record<string,string>{
  const s=themeTokens(theme).surfaces,foreground=accentForeground;
  return {'--text':foreground(s.panel),'--muted':foreground(s.panel),'--hive-document-text':foreground(s.document),'--hive-titlebar-text':foreground(s.titleBar),'--hive-header-text':foreground(s.panelHeader),'--hive-ribbon-title-text':foreground(s.ribbonTitleBackground),'--hive-ribbon-content-text':foreground(s.ribbon),'--hive-settings-text':foreground(s.settingsBackground),'--hive-settings-sidebar-text':foreground(s.settingsSidebar),'--hive-settings-card-text':foreground(s.settingsCard),'--hive-input-text':foreground(s.input),'--hive-popup-text':foreground(s.popup),'--hive-selection-text':foreground(s.selection),'--hive-on-accent':foreground(theme.colors.accent)};
}
export const automaticTextRoles={documentText:'--hive-document-text',uiText:'--text',mutedText:'--muted',ribbonTitleText:'--hive-ribbon-title-text',ribbonContentText:'--hive-ribbon-content-text'} as const;
