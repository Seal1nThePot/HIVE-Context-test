import {describe,it,expect} from 'vitest';
import {TreeFragment,type Tree} from '@lezer/common';
import {ensureSyntaxTree} from '@codemirror/language';
import {sourceMarkdownLanguage,compactSourceThreshold} from './sourceSyntax';
import {makeState} from './Editor';
import {previewPlan} from './markdownPresentation';
import {headings} from '../../shared/core';
import {markdownParseState} from './markdownParse';
import {undo,redo} from '@codemirror/commands';
import type {Transaction} from '@codemirror/state';

const table='| **A** | B |\n| --- | --- |\n| x | y |';
const filler='\n\n'+('普通段落\n\n'.repeat(Math.ceil(compactSourceThreshold/6)));
function count(tree:Tree,name:string){let count=0;tree.iterate({enter(node){if(node.name===name)count++;}});return count;}

describe('adaptive source-colouring tree',()=>{
  it('retains detailed GFM colouring for small notes and only compacts duplicate table nodes for large ones',()=>{
    const parser=sourceMarkdownLanguage.parser,small=parser.parse(table),large=parser.parse(table+filler);
    expect(count(small,'Table')).toBe(1);expect(count(small,'TableCell')).toBe(4);
    expect(count(large,'Table')).toBe(1);expect(count(large,'TableCell')).toBe(0);
    const state=makeState(table+filler,()=>{});
    expect(previewPlan(state).replacements.find(item=>item.kind==='table')?.rows?.map(row=>row.map(cell=>cell.text))).toEqual([['**A**','B'],['x','y']]);
  });
  it('switches colouring strategies on a large paste and restores full details when edited small again',()=>{
    let state=makeState(table,()=>{},undefined,'source');
    expect(count(ensureSyntaxTree(state,state.doc.length,1000)!,'TableCell')).toBe(4);
    state=state.update({changes:{from:state.doc.length,insert:filler}}).state;
    expect(count(ensureSyntaxTree(state,state.doc.length,1000)!,'TableCell')).toBe(0);
    state=state.update({changes:{from:table.length,to:state.doc.length,insert:''}}).state;
    expect(count(ensureSyntaxTree(state,state.doc.length,1000)!,'TableCell')).toBe(4);expect(state.doc.toString()).toBe(table);
  });
  it('rejects tree fragments from the other strategy when the document crosses its threshold',()=>{
    const parser=sourceMarkdownLanguage.parser,small=parser.parse(table),bigText=table+filler;
    const grown=TreeFragment.applyChanges(TreeFragment.addTree(small),[{fromA:table.length,toA:table.length,fromB:table.length,toB:bigText.length}]);
    const big=parser.parse(bigText,grown);expect(count(big,'TableCell')).toBe(0);
    const shrunk=TreeFragment.applyChanges(TreeFragment.addTree(big),[{fromA:table.length,toA:bigText.length,fromB:table.length,toB:table.length}]);
    const restored=parser.parse(table,shrunk);expect(count(restored,'TableCell')).toBe(4);
  });
  it('keeps escaped-pipe, noncanonical, nested and fenced constructs on their correct syntax path',()=>{
    const parser=sourceMarkdownLanguage.parser;
    expect(count(parser.parse('| A \\| B | C |\n| --- | --- |\n| x | y |'+filler),'Table')).toBe(1);
    expect(count(parser.parse('| A | B \\|\n| --- |\n'+filler),'Table')).toBe(0);
    expect(count(parser.parse('| A | B |\n| --- |\n'+filler),'Table')).toBe(0);
    const quoted='> '+table.replace(/\n/g,'\n> ');expect(count(parser.parse(quoted+filler),'TableCell')).toBe(4);
    expect(count(parser.parse('```md\n'+table+'\n```'+filler),'Table')).toBe(0);
  });
  it('keeps full GFM table boundaries for bare body rows and following Setext, list and quoted headings',()=>{
    const cases=[
      table+'\nbare row\n====\n\n# 之后',
      table+'\nplain row\n| new | header |\n| --- | --- |\n\n## 之后',
      table+'\n- 列表\n  ## 列表标题\n\n> ## 引用标题',
      '---\ntitle: hidden\n# 元数据中的伪标题\n---\n\n# 正文\n\n'+table+'\n\n```md\n## 代码中的伪标题\n```\n\n## 结尾',
      '> '+table.replace(/\n/g,'\n> ')+'\n\n# 后文',
    ];
    for(const text of cases){
      const source=makeState(text+filler,()=>{},undefined,'source'),live=makeState(text+filler,()=>{});
      expect(headings(source)).toEqual(headings(live));expect(source.field(markdownParseState).tree).toBeUndefined();
    }
  });
  it('updates source-mode headings and undo without building the live cell plan or detail tree',()=>{
    const text='# 前文\n\n'+table+filler+'\n\n## 后文';let state=makeState(text,()=>{},undefined,'source');
    headings(state);const from=text.indexOf('| x |')+2;
    state=state.update({changes:{from,insert:'源码编辑'},userEvent:'input.type'}).state;
    expect(headings(state)).toEqual(headings(makeState(state.doc.toString(),()=>{})));
    expect(state.field(markdownParseState).tree).toBeUndefined();
    const dispatch=(tr:Transaction)=>{state=tr.state;};
    expect(undo({state,dispatch})).toBe(true);expect(state.doc.toString()).toBe(text);expect(headings(state)).toEqual(headings(makeState(text,()=>{})));
    expect(redo({state,dispatch})).toBe(true);expect(headings(state)).toEqual(headings(makeState(state.doc.toString(),()=>{})));
  });
});
