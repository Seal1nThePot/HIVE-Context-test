import {oliveGraySurfaces,oliveWhiteSurfaces} from './oliveGoldBuiltins';

export const surfaceColorGroups=[
  {title:'工作区与面板',fields:[['titleBar','最上方标题栏'],['ribbonTitleBackground','编辑栏标题行背景'],['ribbonTitleText','编辑栏标题文字'],['ribbon','编辑栏工具区背景'],['ribbonContentText','编辑栏工具区图标与文字'],['ribbonBorder','编辑栏下边框'],['leftRailBackground','左侧收纳栏背景'],['leftRailIcon','左侧收纳栏图标'],['rightRailBackground','右侧收纳栏背景'],['rightRailIcon','右侧收纳栏图标'],['workspace','工作区底色'],['panel','左右面板与浮窗'],['panelHeader','标签栏与底栏'],['panelBorder','面板外框'],['panelInnerBorder','面板内框'],['document','中央文档背景'],['documentText','正文文字'],['selectedTab','当前标签背景']]},
  {title:'设置与弹出框',fields:[['settingsBackground','设置页面背景'],['settingsSidebar','设置侧栏背景'],['settingsCard','设置卡片背景'],['settingsBorder','设置卡片边框'],['popup','菜单与提示框背景'],['popupBorder','菜单与提示框边框'],['input','输入控件背景'],['inputBorder','输入控件边框']]},
  {title:'界面文字与选中状态',fields:[['uiText','界面文字与图标'],['mutedText','辅助文字'],['selection','选中项目背景']]},
] as const;
export type SurfaceColorRole=typeof surfaceColorGroups[number]['fields'][number][0];
export type SurfaceColors=Record<SurfaceColorRole,string>;
export type SurfaceBase='black'|'white'|'gray'|'custom';
export type SurfaceProfiles=Partial<Record<SurfaceBase,Partial<SurfaceColors>>>;
export const oliveBlackSurfaces:SurfaceColors={
  titleBar:'#1a1d1a',ribbon:'#20241f',ribbonTitleBackground:'#20241f',ribbonTitleText:'#c1c7ad',ribbonContentText:'#c1c7ad',ribbonBorder:'#46513a',leftRailBackground:'#252c22',leftRailIcon:'#bbc4a6',rightRailBackground:'#252c22',rightRailIcon:'#bbc4a6',workspace:'#171b17',panel:'#1b1f1b',panelHeader:'#1d231b',panelBorder:'#343c2d',panelInnerBorder:'#343c2d',document:'#262c25',documentText:'#e2e4d5',selectedTab:'#37412f',
  settingsBackground:'#181c18',settingsSidebar:'#121612',settingsCard:'#222820',settingsBorder:'#343c2d',popup:'#222820',popupBorder:'#4a543b',input:'#192016',inputBorder:'#46513b',uiText:'#c1c7ad',mutedText:'#8d9982',selection:'#373f2f',
};
const rgb=(value:string)=>[1,3,5].map(i=>parseInt(value.slice(i,i+2),16));
function blend(a:string,b:string,amount:number){const x=rgb(a),y=rgb(b);return '#'+x.map((v,i)=>Math.round(Math.max(0,Math.min(255,v+(y[i]-v)*amount))).toString(16).padStart(2,'0')).join('');}
function luminance(value:string){const [r,g,b]=rgb(value);return (r*299+g*587+b*114)/1000;}
export function normalizeSurfaceProfiles(value:unknown):SurfaceProfiles{
  const result:SurfaceProfiles={},input=value&&typeof value==='object'?value as Record<string,unknown>:{};
  for(const base of ['black','white','gray','custom'] as const){const raw=input[base];if(!raw||typeof raw!=='object')continue;const colors:Partial<SurfaceColors>={};for(const {fields} of surfaceColorGroups)for(const [role] of fields){const color=(raw as Record<string,unknown>)[role];if(typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color))colors[role]=color.toLowerCase();}result[base]=colors;}
  return result;
}
export function resolveSurfaceColors(base:SurfaceBase,customBase:string,strength:number,profiles:SurfaceProfiles={}):SurfaceColors{
  let colors:SurfaceColors;
  if(base==='black')colors={...oliveBlackSurfaces};
  else if(base==='white')colors={...oliveWhiteSurfaces};
  else if(base==='gray')colors={...oliveGraySurfaces};
  else{
    const light=luminance(customBase)>145,anchor=light?blend(customBase,'#ffffff',.7):luminance(customBase)>80?blend(customBase,'#000000',.5):customBase;
    colors={...(light?oliveWhiteSurfaces:oliveBlackSurfaces)};
    const shades={workspace:.18,panel:.14,panelHeader:.10,ribbon:.08,popup:.06,settingsBackground:.18,settingsCard:.08,settingsSidebar:.25,input:.20,selectedTab:.02};
    for(const role of Object.keys(shades) as (keyof typeof shades)[])colors[role]=blend(anchor,'#000000',shades[role]);
    colors.document=light?blend(anchor,'#ffffff',.8):blend(anchor,'#ffffff',.025);colors.titleBar=blend(anchor,'#000000',.3);colors.ribbonTitleBackground=colors.ribbon;
  }
  // Contrast changes affect automatic colors; explicit color choices take precedence.
  if(strength!==1)for(const role of ['workspace','panel','panelHeader','ribbon','popup'] as const)colors[role]=blend(colors.document,colors[role],strength);
  const resolved={...colors,...profiles[base]},explicit=profiles[base];
  if(explicit?.ribbon&&!explicit.ribbonTitleBackground)resolved.ribbonTitleBackground=resolved.ribbon;
  if(explicit?.uiText&&!explicit.ribbonTitleText)resolved.ribbonTitleText=resolved.uiText;
  if(explicit?.uiText&&!explicit.ribbonContentText)resolved.ribbonContentText=resolved.uiText;
  if(explicit?.panelBorder&&!explicit.panelInnerBorder)resolved.panelInnerBorder=resolved.panelBorder;
  return resolved;
}
