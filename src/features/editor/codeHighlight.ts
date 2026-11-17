import {HighlightStyle,syntaxHighlighting,StreamLanguage} from '@codemirror/language';
import {javascriptLanguage,jsxLanguage,typescriptLanguage,tsxLanguage} from '@codemirror/lang-javascript';
import {htmlLanguage} from '@codemirror/lang-html';
import {cssLanguage} from '@codemirror/lang-css';
import {jsonLanguage} from '@codemirror/lang-json';
import {csharp} from '@codemirror/legacy-modes/mode/clike';
import {tags} from '@lezer/highlight';

export const csharpLanguage=StreamLanguage.define(csharp);
const languages={js:javascriptLanguage,javascript:javascriptLanguage,jsx:jsxLanguage,ts:typescriptLanguage,typescript:typescriptLanguage,tsx:tsxLanguage,html:htmlLanguage,css:cssLanguage,json:jsonLanguage,cs:csharpLanguage,'c#':csharpLanguage,csharp:csharpLanguage};
export function fencedCodeLanguage(info:string){
  const name=info.trim().split(/\s+/)[0].toLowerCase();
  return Object.prototype.hasOwnProperty.call(languages,name)?languages[name as keyof typeof languages]:null;
}
// Scope each style to an embedded language so Markdown outside the fence keeps
// its existing colours. Mix toward document text for both light and dark themes.
const rules=[
  {tag:[tags.keyword,tags.modifier,tags.controlKeyword],color:'color-mix(in srgb, var(--hive-document-text, var(--text)) 60%, #a258d4)'},
  {tag:[tags.string,tags.regexp],color:'color-mix(in srgb, var(--hive-document-text, var(--text)) 60%, #249e66)'},
  {tag:[tags.number,tags.bool,tags.null],color:'color-mix(in srgb, var(--hive-document-text, var(--text)) 60%, #df7b29)'},
  {tag:[tags.comment],color:'color-mix(in srgb, var(--hive-document-text, var(--text)) 70%, var(--hive-document-bg, #fff))',fontStyle:'italic'},
  {tag:[tags.function(tags.variableName),tags.definition(tags.variableName),tags.tagName,tags.attributeName,tags.propertyName],color:'color-mix(in srgb, var(--hive-document-text, var(--text)) 65%, #3d8bdf)'},
];
export const fencedCodeHighlight=[...new Set(Object.values(languages))].map(language=>syntaxHighlighting(HighlightStyle.define(rules,{scope:language})));
