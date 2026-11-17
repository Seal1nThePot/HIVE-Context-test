import {describe,it,expect} from 'vitest';
import {csharpLanguage,fencedCodeLanguage} from './codeHighlight';
import {javascriptLanguage,jsxLanguage,typescriptLanguage,tsxLanguage} from '@codemirror/lang-javascript';
import {htmlLanguage} from '@codemirror/lang-html';
import {cssLanguage} from '@codemirror/lang-css';
import {jsonLanguage} from '@codemirror/lang-json';

describe('fenced code language selection',()=>{
  it('recognizes explicitly named languages and common aliases',()=>{
    expect(['js','javascript','jsx','ts','typescript','tsx','html','css'].map(fencedCodeLanguage)).toEqual([javascriptLanguage,javascriptLanguage,jsxLanguage,typescriptLanguage,typescriptLanguage,tsxLanguage,htmlLanguage,cssLanguage]);
    expect(fencedCodeLanguage(' TypeScript linenos')).toBe(typescriptLanguage);
    expect(['cs','c#','csharp','Csharp'].map(fencedCodeLanguage)).toEqual([csharpLanguage,csharpLanguage,csharpLanguage,csharpLanguage]);
    expect(fencedCodeLanguage('json')).toBe(jsonLanguage);
  });
  it('keeps unspecified and unsupported languages plain',()=>{
    for(const name of ['', 'python','__proto__'])expect(fencedCodeLanguage(name)).toBeNull();
  });
});
