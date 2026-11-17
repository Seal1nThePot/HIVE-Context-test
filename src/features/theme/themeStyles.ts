import {brightness,mix,themeTokens,type ThemePreferences} from './themePreferences';

type LegacyColor={r:number;g:number;b:number;alpha?:number};
export type LegacyColors=Map<string,LegacyColor>;
const colorPattern=/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)|#([0-9a-f]{3,8})\b/gi;
const colorProperty=/^(color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|box-shadow|text-shadow|fill|stroke|caret-color|text-decoration-color)$/;

/** Compile source rules once. Subsequent color previews only update root variables. */
export function compileThemeRules(rules:CSSRuleList,colors:LegacyColors,semantic=false):string{
  let output='';
  for(const rule of Array.from(rules)){
    if(rule.type===1){
      const styleRule=rule as CSSStyleRule;if(styleRule.selectorText.includes(':root'))continue;let declarations='';
      for(const property of Array.from(styleRule.style)){
        if(!colorProperty.test(property))continue;
        const original=styleRule.style.getPropertyValue(property);if(original.includes('url('))continue;
        const semanticText=semantic&&property==='color'&&!/inherit|currentColor|transparent|--hive-[\w-]*(?:text|icon)|--hive-on-accent|--hive-dock-/.test(original);
        if(original.includes('var(')&&!semanticText)continue;
        if(semantic){
          const selector=styleRule.selectorText,active=/:hover|:focus|aria-selected|\.active|selected|checked/.test(selector);
          const background=/settings-primary|primary-action|send-button/.test(selector)?'--hive-accent':active?'--hive-selection-bg':/input|select|textarea|composer|secondary|field/.test(selector)?'--hive-input-bg':/popup|menu|tooltip|toast|dialog/.test(selector)?'--hive-popup-bg':/settings-sidebar/.test(selector)?'--hive-settings-sidebar':/settings-card|service-card/.test(selector)?'--hive-settings-card':/settings-page|settings-content/.test(selector)?'--hive-settings-bg':/ribbon-tab/.test(selector)?'--hive-ribbon-title-bg':/ribbon/.test(selector)?'--hive-ribbon-bg':/app-header/.test(selector)?'--hive-titlebar-bg':/header|title|tabs|footer|status-bar/.test(selector)?'--hive-header-bg':/document-pane|cm-|scratch/.test(selector)?'--hive-document-bg':'--hive-panel-bg';
          const foreground=background==='--hive-accent'?'--hive-on-accent':background==='--hive-selection-bg'?'--hive-selection-text':background==='--hive-input-bg'?'--hive-input-text':background==='--hive-popup-bg'?'--hive-popup-text':background==='--hive-settings-sidebar'?'--hive-settings-sidebar-text':background==='--hive-settings-card'?'--hive-settings-card-text':background==='--hive-settings-bg'?'--hive-settings-text':background==='--hive-ribbon-title-bg'?'--hive-ribbon-title-text':background==='--hive-ribbon-bg'?'--hive-ribbon-content-text':background==='--hive-titlebar-bg'?'--hive-titlebar-text':background==='--hive-header-bg'?'--hive-header-text':background==='--hive-document-bg'?'--hive-document-text':'--text';
          const token=property==='color'||property==='caret-color'||property==='fill'||property==='stroke'?foreground:property.startsWith('background')?background:property.includes('shadow')?'--hive-surface-border':/input|select|textarea|secondary/.test(selector)?'--hive-input-border':/popup|menu|tooltip|dialog/.test(selector)?'--hive-popup-border':'--hive-panel-inner-border';
          const changed=semanticText?`var(${foreground})`:original.replace(colorPattern,(match,_r,_g,_b,alpha,hex)=>{
            const opacity=hex&&(hex.length===4||hex.length===8)?parseInt(hex.length===4?hex.slice(-1).repeat(2):hex.slice(-2),16)/255:alpha===undefined?1:Number(alpha);
            if(property.startsWith('background')&&opacity===0)return 'transparent';
            return opacity<1?`color-mix(in srgb,var(${token}) ${Math.round(opacity*10000)/100}%,transparent)`:`var(${token})`;
          });if(changed!==original)declarations+=`${property}:${changed}${styleRule.style.getPropertyPriority(property)?' !important':''};`;
          continue;
        }
        const changed=original.replace(colorPattern,(match,r,g,b,alpha,hex)=>{
          if(hex){if(![3,4,6,8].includes(hex.length))return match;const h=hex.length<=4?[...hex].map((c:string)=>c+c).join(''):hex;r=parseInt(h.slice(0,2),16);g=parseInt(h.slice(2,4),16);b=parseInt(h.slice(4,6),16);alpha=h.length===8?parseInt(h.slice(6),16)/255:undefined;}
          const color={r:Number(r),g:Number(g),b:Number(b),alpha:alpha===undefined?undefined:Number(alpha)};
          const suffix=[color.r,color.g,color.b,...(color.alpha===undefined?[]:[Math.round(color.alpha*255)])].map(v=>v.toString(16).padStart(2,'0')).join('');
          const name=`--hive-legacy-${suffix}`;colors.set(name,color);return `var(${name})`;
        });
        if(changed!==original)declarations+=`${property}:${changed}${styleRule.style.getPropertyPriority(property)?' !important':''};`;
      }
      if(declarations)output+=`${styleRule.selectorText}{${declarations}}\n`;
    }else if(rule.type===4||rule.type===12){
      const group=rule as CSSGroupingRule,inner=compileThemeRules(group.cssRules,colors,semantic);
      if(inner)output+=`${rule.cssText.slice(0,rule.cssText.indexOf('{'))}{${inner}}\n`;
    }
  }
  return output;
}
export function legacyColorVariables(colors:LegacyColors,theme:ThemePreferences):Record<string,string>{
  const token=themeTokens(theme),values:Record<string,string>={};
  for(const [name,{r,g,b,alpha}] of colors){
    const original='#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join(''),lum=brightness(original),spread=Math.max(r,g,b)-Math.min(r,g,b);
    let mapped:string;
    if(spread>35&&lum>85&&r>g*1.08&&g>b*1.1)mapped=lum>190?mix(token.accent,token.foreground,.22):token.accent;
    else if(spread>45&&r>g*1.3&&r>b*1.15)mapped=theme.colors.danger;
    else if(lum<85)mapped=mix(token.base,token.light?'#000000':'#ffffff',Math.min(.24,lum/400));
    else if(lum<155)mapped=mix(token.muted,token.base,(155-lum)/150);
    else mapped=mix(token.foreground,token.base,Math.max(0,(235-lum)/420));
    values[name]=alpha===undefined?mapped:`${mapped}${Math.round(alpha*255).toString(16).padStart(2,'0')}`;
  }
  return values;
}
