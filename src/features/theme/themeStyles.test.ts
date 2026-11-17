import {describe,expect,it} from 'vitest';
import {defaultTheme} from './themePreferences';
import {compileThemeRules,legacyColorVariables,type LegacyColors} from './themeStyles';

function rule(selectorText:string,values:Record<string,string>,important=''){
  const style=Object.assign(Object.keys(values),{getPropertyValue:(key:string)=>values[key],getPropertyPriority:()=>important});
  return {type:1,selectorText,style} as unknown as CSSStyleRule;
}
describe('cached theme stylesheet',()=>{
  it('keeps explicitly bound semantic and custom docking colors authoritative',()=>{
    for(const token of ['--text','--muted','--gold','--hive-danger','--hive-link','--hive-success','--hive-on-danger','--hive-raised-text','--hive-dock-guide-icon'])expect(compileThemeRules([rule('.button',{color:`var(${token})`})] as unknown as CSSRuleList,new Map(),true)).toBe('');
  });
  it('compiles selectors once and changes only variable values across color previews',()=>{
    const colors:LegacyColors=new Map(),rules=[rule('.button',{color:'#c0a060',background:'rgba(20, 30, 25, 0.5)'},'important')] as unknown as CSSRuleList;
    const css=compileThemeRules(rules,colors),first=legacyColorVariables(colors,defaultTheme),second=legacyColorVariables(colors,{...defaultTheme,colors:{...defaultTheme.colors,accent:'#ff6600'}});
    expect(css).toContain('color:var(--hive-legacy-c0a060) !important');expect(css).toContain('background:var(--hive-legacy-141e1980) !important');expect(first['--hive-legacy-c0a060']).not.toBe(second['--hive-legacy-c0a060']);expect(second['--hive-legacy-141e1980']).toMatch(/^#[0-9a-f]{6}80$/);expect(Object.keys(first)).toEqual(Object.keys(second));
  });
  it('retains media grouping and ignores semantic variables, URLs and non-color declarations',()=>{
    const colors:LegacyColors=new Map(),inner=[rule('.a',{color:'var(--text)',background:'url(image.png)',width:'123px'}),rule('.b',{color:'#fff'})] as unknown as CSSRuleList;
    const css=compileThemeRules([{type:4,cssText:'@media (min-width: 500px) {}',cssRules:inner}] as unknown as CSSRuleList,colors);
    expect(css).toContain('@media (min-width: 500px) {.b{color:var(--hive-legacy-ffffff);}');expect(css).not.toContain('.a');expect(colors.size).toBe(1);
  });
  it('binds old literal styles to current template roles, preserving transparent backgrounds',()=>{
    const colors:LegacyColors=new Map(),rules=[rule('.settings-secondary',{color:'#c9d0b7',background:'#2b3425'}),rule('.settings-secondary:hover',{color:'var(--gold)',background:'#3a4430'}),rule('.clear',{background:'#00000000'})] as unknown as CSSRuleList;
    const css=compileThemeRules(rules,colors,true);expect(css).toContain('background:var(--hive-input-bg)');expect(css).toContain('background:var(--hive-selection-bg)');expect(css).toContain('color:var(--hive-input-text)');expect(css).not.toContain('color:var(--hive-selection-text)');expect(css).toContain('background:transparent');expect(css).not.toContain('#2b3425');expect(colors.size).toBe(0);
    expect(compileThemeRules([rule('.nearby-panel-rail button',{color:'var(--hive-left-rail-icon)'})] as unknown as CSSRuleList,new Map(),true)).toBe('');
  });
});
