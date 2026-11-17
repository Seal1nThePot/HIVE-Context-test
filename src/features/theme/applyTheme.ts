import {useLayoutEffect} from 'react';
import {writingDockTokens} from '../chat/writingDockAppearance';
import {mix,themeTokens,type ThemePreferences} from './themePreferences';
import {flushThemePreferences,getThemeSnapshot,subscribeTheme} from './themeStore';
import {compileThemeRules,legacyColorVariables,type LegacyColors} from './themeStyles';
import {initializeThemeFiles} from './templateFiles';
import {automaticTextTokens} from './automaticText';

function setVariable(root:HTMLElement,key:string,value:string){if(root.style.getPropertyValue(key)!==value)root.style.setProperty(key,value);}
export function applyThemeTokens(root:HTMLElement,theme:ThemePreferences){
  const t=themeTokens(theme),s=t.surfaces,role=(color:string)=>t.light?mix(color,'#000000',.38):color,values:Record<string,string>={'--bg':s.workspace,'--panel':t.panel,'--panel-2':t.panel2,'--line':t.line,'--text':t.foreground,'--muted':t.muted,'--gold':t.accent,'--hive-accent':t.rawAccent,'--hive-on-accent':t.onAccent,'--gold-bg':`${t.accent}20`,'--green':theme.colors.secondary,'--hive-workspace-bg':t.workspaceSurface,'--hive-document-bg':t.documentSurface,'--hive-document-text':s.documentText,'--hive-panel-bg':t.panelSurface,'--hive-header-bg':t.headerSurface,'--hive-raised-bg':t.raisedSurface,'--hive-surface-border':t.borderSurface,'--hive-titlebar-bg':s.titleBar,'--hive-ribbon-bg':s.ribbon,'--hive-ribbon-border':s.ribbonBorder,'--hive-settings-bg':s.settingsBackground,'--hive-settings-sidebar':s.settingsSidebar,'--hive-settings-card':s.settingsCard,'--hive-settings-border':s.settingsBorder,'--hive-input-bg':s.input,'--hive-input-border':s.inputBorder,'--hive-selection-bg':s.selection,'--hive-popup-bg':s.popup,'--hive-popup-text':t.foreground,'--hive-popup-border':s.popupBorder,'--hive-popup-shadow':'0 8px 28px #0007','--hive-link':role(theme.colors.link),'--hive-success':role(theme.colors.success),'--hive-warning':role(theme.colors.warning),'--hive-danger':role(theme.colors.danger)};
  Object.assign(values,{'--hive-ribbon-title-bg':s.ribbonTitleBackground,'--hive-ribbon-title-text':s.ribbonTitleText,'--hive-ribbon-content-text':s.ribbonContentText,'--hive-left-rail-bg':s.leftRailBackground,'--hive-left-rail-icon':s.leftRailIcon,'--hive-right-rail-bg':s.rightRailBackground,'--hive-right-rail-icon':s.rightRailIcon,'--hive-panel-inner-border':s.panelInnerBorder});
  Object.assign(values,automaticTextTokens(theme));
  for(const [key,value] of Object.entries(values))setVariable(root,key,value);
  for(const [key,value] of Object.entries(writingDockTokens(theme.writingDock,theme.colors.accent)))setVariable(root,key,value);
  root.classList.toggle('hive-theme-light',t.light);root.style.color=values['--text'];root.style.backgroundColor=s.workspace;
}
export function useApplyTheme(){useLayoutEffect(()=>{
  const root=document.documentElement,style=document.createElement('style');style.dataset.hiveThemeOverrides='';document.head.appendChild(style);
  let colors:LegacyColors=new Map(),frame=0,recompile=true;
  const render=()=>{
    frame=0;
    if(recompile){
      recompile=false;const nextColors:LegacyColors=new Map();let text='';
      for(const sheet of Array.from(document.styleSheets)){if(sheet.ownerNode===style)continue;try{text+=compileThemeRules(sheet.cssRules,nextColors,true);}catch{/* Cross-origin sheets cannot be inspected. */}}
      for(const name of colors.keys())if(!nextColors.has(name))root.style.removeProperty(name);
      colors=nextColors;if(style.textContent!==text)style.textContent=text;
    }
    const {preferences}=getThemeSnapshot();applyThemeTokens(root,preferences);
    for(const [key,value] of Object.entries(legacyColorVariables(colors,preferences)))setVariable(root,key,value);
    if(style.media!=='all')style.media='all';
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(render);};
  const observer=new MutationObserver(records=>{
    if(records.every(record=>record.target===style||style.contains(record.target)))return;
    recompile=true;schedule();
  });
  observer.observe(document.head,{subtree:true,childList:true,characterData:true});
  const unsubscribe=subscribeTheme(schedule);render();void initializeThemeFiles();flushThemePreferences();
  return()=>{unsubscribe();observer.disconnect();cancelAnimationFrame(frame);style.remove();};
},[]);}
