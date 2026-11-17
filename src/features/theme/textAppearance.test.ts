import {describe,expect,it} from 'vitest';
import blue from '../../../templates/mediterranean-blue/colors.json';
import olive from '../../../templates/olive-gold/colors.json';
import claudeOlive from '../../../templates/claude-olive-gold/colors.json';
import claudeBlue from '../../../templates/claude-mediterranean-blue/colors.json';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ThemeSettings from './ThemeSettings';
import {surfaceTextTokens,compositeBackground} from './textAppearance';
import {applyThemeTokens} from './applyTheme';
import {createTemplateBinding,templateBaseDefaults} from './templateBinding';
import {defaultTheme,normalizeTheme,themeTokens} from './themePreferences';

describe('editable surface text',()=>{
  it('uses every template’s declared text palette without replacing it with black and white',()=>{
    for(const [id,bases,raw] of [['olive-gold',['black','gray','white'],olive],['mediterranean-blue',['black','white'],blue],['claude-olive-gold',['black','gray','white'],claudeOlive],['claude-mediterranean-blue',['white','gray','black'],claudeBlue]] as const){const binding=createTemplateBinding({id,name:id,bases:[...bases]},raw);for(const base of bases){const theme=templateBaseDefaults(binding,base),tokens=surfaceTextTokens(theme),s=themeTokens(theme).surfaces;expect(tokens['--text']).toBe(s.uiText);expect(tokens['--muted']).toBe(s.mutedText);expect(tokens['--hive-document-text']).toBe(s.documentText);expect(tokens['--hive-ribbon-title-text']).toBe(s.ribbonTitleText);expect(tokens['--hive-ribbon-content-text']).toBe(s.ribbonContentText);}}
  });
  it('applies exact personal text colors across light and dark backgrounds, including inherited UI regions',()=>{
    for(const background of ['#ffffff','#111111']){
      const theme=normalizeTheme({...defaultTheme,surfaceColors:{black:{panel:background,document:background,uiText:'#123456',mutedText:'#654321',documentText:'#102938',ribbonTitleText:'#abcdef',ribbonContentText:'#fedcba'}}}),values:Record<string,string>={};
      const root={style:{getPropertyValue:(key:string)=>values[key],setProperty:(key:string,value:string)=>{values[key]=value;}},classList:{toggle:()=>{}}} as unknown as HTMLElement;
      applyThemeTokens(root,theme);
      for(const key of ['--text','--hive-titlebar-text','--hive-header-text','--hive-settings-text','--hive-settings-sidebar-text','--hive-settings-card-text','--hive-input-text','--hive-popup-text','--hive-selection-text','--hive-raised-text'])expect(values[key]).toBe('#123456');
      expect(values['--muted']).toBe('#654321');expect(values['--hive-document-text']).toBe('#102938');expect(values['--hive-ribbon-title-text']).toBe('#abcdef');expect(values['--hive-ribbon-content-text']).toBe('#fedcba');
    }
  });
  it('renders editable color and HEX inputs for all five formerly automatic fields',()=>{
    const html=renderToStaticMarkup(createElement(ThemeSettings));
    for(const label of ['界面文字与图标','辅助文字','正文文字','编辑栏标题文字','编辑栏工具区图标与文字']){expect(html).toContain(`aria-label="${label}颜色选择"`);expect(html).toContain(`aria-label="${label}颜色值"`);}
    expect(html).not.toContain('自动 ·');expect(html).not.toContain('自动黑白');
  });
  it('composites transparent colors for overlay foregrounds',()=>{expect(compositeBackground('#00000000','#ffffff')).toBe('#ffffff');expect(compositeBackground('#00000080','#ffffff')).toBe('#7f7f7f');});
});
