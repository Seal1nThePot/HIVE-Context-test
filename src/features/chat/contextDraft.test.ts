import {describe,expect,it} from 'vitest';
import {EditorSelection} from '@codemirror/state';
import {makeState} from '../editor/Editor';
import {headings} from '../../shared/core';
import {appendDraftContext,chapterForQuickAI,readChapterDrag,textForQuickAI} from './contextDraft';

describe('AI draft context',()=>{
  const source='# 第一章\n\n段落首行。\n下一行属于同一段落。\n\n## 下级标题\n\n| 项目 | 内容 |\n| --- | --- |\n| A | B |\n\n# 相邻章节\n这段不能带入。';
  const state=makeState(source,()=>{});

  it('prioritizes a precise selection and falls back to the whole clicked paragraph',()=>{
    const start=source.indexOf('段落首行'),position=source.indexOf('属于');
    expect(textForQuickAI(state,EditorSelection.single(start,start+4),position)).toBe('段落首行');
    expect(textForQuickAI(state,EditorSelection.single(position),position)).toBe('段落首行。\n下一行属于同一段落。');
  });

  it('uses matched heading identity and includes descendants up to the sibling boundary',()=>{
    const [title,child]=headings(state),chapter=chapterForQuickAI(state,title);
    expect(chapter).toBe(source.slice(0,source.indexOf('# 相邻章节')).trimEnd());
    expect(chapterForQuickAI(state,child)).toContain('| A | B |');
    expect(chapterForQuickAI(state,{...title,title:'已改名'})).toBe('');
    expect(readChapterDrag(JSON.stringify({workspace:'repo-a',editor:'editor',file:'note.md',heading:title}),'repo-b')).toBeNull();
  });

  it('keeps the existing draft and table syntax intact',()=>{
    const table='| Name | Value |\n| --- | --- |\n| A | B |';
    expect(appendDraftContext('已有提示','表格',table)).toBe(`已有提示\n\n【表格】\n${table}\n\n`);
  });
});
