import {describe,it,expect} from 'vitest';
import {EditorState,EditorSelection} from '@codemirror/state';
import {history,undo,redo} from '@codemirror/commands';
import {markdown,markdownLanguage} from '@codemirror/lang-markdown';
import {inlineFormatting,paragraphAlignment,lineFormatting,inspectFormatting,insertStructure} from './formatting';
import {headings,visibleCount} from '../../shared/core';

function state(doc:string,from=0,to=from){return EditorState.create({doc,selection:EditorSelection.range(from,to),extensions:[markdown({base:markdownLanguage}),history(),EditorState.allowMultipleSelections.of(true)]});}
function format(doc:string,from:number,to:number){const before=state(doc,from,to);return before.update(inlineFormatting(before,'underline')).state;}

describe('editable text formats',()=>{
  it('toggles strikethrough and inline code, including literal backticks and selected source',()=>{
    let value=state('文字',0,2);value=value.update(inlineFormatting(value,'strike')).state;expect(value.doc.toString()).toBe('~~文字~~');value=value.update(inlineFormatting(value,'strike')).state;expect(value.doc.toString()).toBe('文字');
    value=state('`内容`',0,4);value=value.update(inlineFormatting(value,'inlineCode')).state;expect(value.doc.toString()).toBe('内容');
    value=state('含`符号',0,4);value=value.update(inlineFormatting(value,'inlineCode')).state;expect(value.doc.toString()).toBe('``含`符号``');value=value.update(inlineFormatting(value,'inlineCode')).state;expect(value.doc.toString()).toBe('含`符号');
  });
  it('inserts links with the address selected, code blocks and rules without discarding surrounding text',()=>{
    let value=state('链接',0,2);value=value.update(insertStructure(value,'link')).state;expect(value.doc.toString()).toBe('[链接](https://)');expect(value.sliceDoc(value.selection.main.from,value.selection.main.to)).toBe('https://');
    value=state('正文',1);value=value.update(insertStructure(value,'codeBlock')).state;expect(value.doc.toString()).toBe('```\n正文\n```');expect(value.selection.main.from).toBe(5);
    value=state('保留',2);value=value.update(insertStructure(value,'rule')).state;expect(value.doc.toString()).toBe('保留\n\n---\n\n');
  });
  it('underlines the exact selection, retains it, toggles off, and counts only the text',()=>{
    let value=format('保留 这句话 尾文',3,6);
    expect(value.doc.toString()).toBe('保留 <u>这句话</u> 尾文');
    expect(value.sliceDoc(value.selection.main.from,value.selection.main.to)).toBe('这句话');
    expect(visibleCount(value.doc.toString())).toBe(7);
    value=value.update(inlineFormatting(value,'underline')).state;
    expect(value.doc.toString()).toBe('保留 这句话 尾文');
  });
  it('places an empty cursor inside the new underline and removes it on a second use',()=>{
    let value=format('甲乙',1,1);expect(value.doc.toString()).toBe('甲<u></u>乙');expect(value.selection.main.from).toBe(4);
    value=value.update(inlineFormatting(value,'underline')).state;expect(value.doc.toString()).toBe('甲乙');expect(value.selection.main.from).toBe(1);
  });
  it('formats multiple ranges in one transaction and preserves reverse selections',()=>{
    let value=state('甲乙 丙丁');value=value.update({selection:EditorSelection.create([EditorSelection.range(2,0),EditorSelection.range(3,5)],1)}).state;
    value=value.update(inlineFormatting(value,'underline')).state;
    expect(value.doc.toString()).toBe('<u>甲乙</u> <u>丙丁</u>');
    expect(value.selection.ranges[0].anchor).toBeGreaterThan(value.selection.ranges[0].head);
    expect(value.selection.ranges.map(range=>value.sliceDoc(range.from,range.to))).toEqual(['甲乙','丙丁']);
  });
  it('keeps blank lines outside underline tags and can remove a selection containing the tags',()=>{
    let value=format('甲\n\n乙',0,4);expect(value.doc.toString()).toBe('<u>甲</u>\n\n<u>乙</u>');
    value=value.update({selection:{anchor:0,head:value.doc.length}}).state;
    value=value.update(inlineFormatting(value,'underline')).state;expect(value.doc.toString()).toBe('甲\n\n乙');
  });
  it('supports bold and italic using Markdown markers',()=>{
    let value=state('写作',0,2);value=value.update(inlineFormatting(value,'bold')).state;
    expect(value.doc.toString()).toBe('**写作**');value=value.update(inlineFormatting(value,'bold')).state;expect(value.doc.toString()).toBe('写作');
    value=value.update(inlineFormatting(value,'italic')).state;expect(value.doc.toString()).toBe('*写作*');
  });
  it('refuses code and read-only edits; ignores escaped underline markers',()=>{
    const code=state('`<u>示例</u>`',4,6);expect(()=>inlineFormatting(code,'underline')).toThrow('代码');
    expect(inspectFormatting(code).underlines).toHaveLength(0);
    expect(inspectFormatting(state('\\<u>示例</u>')).underlines).toHaveLength(0);
    const readonly=EditorState.create({doc:'只读',extensions:[EditorState.readOnly.of(true)]});expect(()=>inlineFormatting(readonly,'underline')).toThrow('只读');
  });
  it('isolates each formatting action in undo history',()=>{
    let value=state('');value=value.update({changes:{from:0,insert:'写作'},selection:{anchor:0,head:2},userEvent:'input.type'}).state;
    value=value.update(inlineFormatting(value,'underline')).state;
    const target={get state(){return value;},dispatch(tr:ReturnType<EditorState['update']>){value=tr.state;}};
    expect(undo(target)).toBe(true);expect(value.doc.toString()).toBe('写作');
    expect(redo(target)).toBe(true);expect(value.doc.toString()).toBe('<u>写作</u>');
  });
});

describe('paragraph alignment stored in Markdown',()=>{
  it('aligns the paragraph containing the cursor and preserves surrounding text',()=>{
    let value=state('# 标题\n\n第一行\n第二行\n\n后文',7);
    value=value.update(paragraphAlignment(value,'center')).state;
    expect(value.doc.toString()).toBe('# 标题\n\n<div style="text-align: center;">\n\n第一行\n第二行\n\n</div>\n\n后文');
    expect(value.sliceDoc(value.selection.main.from-1,value.selection.main.from+1)).toBe('第一');
    expect(inspectFormatting(value).blocks).toHaveLength(1);
    expect(visibleCount(value.doc.toString())).toBe(visibleCount('# 标题\n\n第一行\n第二行\n\n后文'));
    expect(headings(value).map(item=>item.title)).toEqual(['标题']);
  });
  it('changes existing alignment without nesting and retains an explicit left choice',()=>{
    const original='前文\n\n需要对齐\n\n后文';let value=state(original,5,7);
    value=value.update(paragraphAlignment(value,'center')).state;
    value=value.update(paragraphAlignment(value,'right')).state;
    expect(value.doc.toString().match(/<div /g)).toHaveLength(1);expect(inspectFormatting(value).blocks[0].alignment).toBe('right');
    value=value.update(paragraphAlignment(value,'left')).state;
    expect(value.doc.toString()).toBe('前文\n\n<div style="text-align: left;">\n\n需要对齐\n\n</div>\n\n后文');
    expect(value.sliceDoc(value.selection.main.from,value.selection.main.to)).toBe('要对');
    expect(inspectFormatting(value).blocks[0].alignment).toBe('left');
    const unchanged=value.doc;value=value.update(paragraphAlignment(value,'left')).state;expect(value.doc).toBe(unchanged);
  });
  it('explicitly left-aligns ordinary and multiple selected paragraphs with undo and redo',()=>{
    const original='第一段\n\n第二段\n\n后文';let value=state(original,0,7);
    value=value.update(paragraphAlignment(value,'left')).state;
    expect(value.doc.toString()).toBe('<div style="text-align: left;">\n\n第一段\n\n第二段\n\n</div>\n\n后文');
    const target={get state(){return value;},dispatch(tr:ReturnType<EditorState['update']>){value=tr.state;}};
    expect(undo(target)).toBe(true);expect(value.doc.toString()).toBe(original);
    expect(redo(target)).toBe(true);expect(inspectFormatting(value).blocks[0].alignment).toBe('left');
  });
  it('keeps a cursor at the end of the paragraph inside the formatted content',()=>{
    let value=state('一句话',3);value=value.update(paragraphAlignment(value,'center')).state;
    expect(value.doc.sliceString(value.selection.main.head-3,value.selection.main.head)).toBe('一句话');
    const block=inspectFormatting(value).blocks[0];expect(value.selection.main.head).toBe(block.contentTo);
  });
  it('positions an empty paragraph cursor between its wrapper lines',()=>{
    let value=state('');value=value.update(paragraphAlignment(value,'right')).state;
    const block=inspectFormatting(value).blocks[0];expect(value.selection.main.head).toBe(block.contentFrom);
  });
  it('keeps a cursor at the start of a nonempty paragraph before its original first character',()=>{
    let value=state('开头',0);value=value.update(paragraphAlignment(value,'center')).state;
    expect(value.sliceDoc(value.selection.main.head,value.selection.main.head+2)).toBe('开头');
    expect(value.selection.main.head).toBe(inspectFormatting(value).blocks[0].contentFrom);
  });
  it('does not include the next paragraph when a selection ends at its line start',()=>{
    let value=state('选中\n\n保留',0,3);value=value.update(paragraphAlignment(value,'right')).state;
    expect(value.doc.toString()).toBe('<div style="text-align: right;">\n\n选中\n\n</div>\n\n保留');
  });
  it('refuses fenced code, arbitrary divs, and partially overlapping alignment blocks',()=>{
    expect(()=>paragraphAlignment(state('```html\n<u>示例</u>\n```',12),'center')).toThrow('代码');
    expect(()=>paragraphAlignment(state('<div class="own">\n内容\n</div>',18),'center')).toThrow('排版');
    let value=state('第一段\n\n第二段',1);value=value.update(paragraphAlignment(value,'center')).state;
    value=value.update({selection:{anchor:0,head:value.doc.length}}).state;
    expect(()=>paragraphAlignment(value,'right')).toThrow('跨越');
  });
  it('restores preview data after a fresh state is created from saved Markdown',()=>{
    let value=state('保存<u>原文</u>',3);value=value.update(paragraphAlignment(value,'right')).state;
    const reopened=state(value.doc.toString());expect(inspectFormatting(reopened).blocks[0].alignment).toBe('right');expect(inspectFormatting(reopened).underlines).toHaveLength(1);
  });
});

describe('top ribbon paragraph commands',()=>{
  it('changes headings and toggles list markers without replacing the text',()=>{
    let value=state('## 标题',3,5);value=value.update(lineFormatting(value,1)).state;expect(value.doc.toString()).toBe('# 标题');
    value=value.update(lineFormatting(value,0)).state;expect(value.doc.toString()).toBe('标题');
    value=state('甲\n乙',0,3);value=value.update(lineFormatting(value,'numbered')).state;expect(value.doc.toString()).toBe('1. 甲\n2. 乙');
    value=value.update(lineFormatting(value,'bullet')).state;expect(value.doc.toString()).toBe('- 甲\n- 乙');
    value=value.update(lineFormatting(value,'bullet')).state;expect(value.doc.toString()).toBe('甲\n乙');
  });
});
