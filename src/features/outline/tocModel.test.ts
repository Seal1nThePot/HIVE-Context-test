import {describe,it,expect} from 'vitest';
import {EditorState} from '@codemirror/state';
import {markdown} from '@codemirror/lang-markdown';
import {headings,type Heading} from '../../shared/core';
import {tocRows} from './tocModel';
const item=(title:string,level:number,from:number):Heading=>({title,level,from,to:from+title.length+level+1});
describe('document heading navigation',()=>{
  it('builds nesting even when heading levels are skipped',()=>{
    const rows=tocRows([item('章',1,0),item('小节',3,10),item('细节',6,20),item('下一节',2,30),item('下一章',1,40)],new Set());
    expect(rows.map(row=>row.depth)).toEqual([0,1,2,1,0]);expect(rows.map(row=>row.hasChildren)).toEqual([true,true,false,false,false]);
  });
  it('collapses only descendants and retains sibling branches',()=>{
    const items=[item('章',1,0),item('小节',2,10),item('细节',3,20),item('下一节',2,30),item('下一章',1,40)],all=tocRows(items,new Set());
    expect(tocRows(items,new Set([all[1].key])).map(row=>row.heading.title)).toEqual(['章','小节','下一节','下一章']);
    expect(tocRows(items,new Set([all[0].key])).map(row=>row.heading.title)).toEqual(['章','下一章']);
  });
  it('keeps collapsed identities when preceding body text shifts all offsets and distinguishes duplicate titles',()=>{
    const items=[item('章',1,0),item('小节',2,10),item('小节',2,30)],rows=tocRows(items,new Set());
    const shifted=items.map(value=>({...value,from:value.from+50,to:value.to+50}));
    expect(tocRows(shifted,new Set()).map(row=>row.key)).toEqual(rows.map(row=>row.key));expect(rows[1].key).not.toBe(rows[2].key);
  });
  it('uses Markdown headings including Setext and ignores fenced pseudo headings',()=>{
    const state=EditorState.create({doc:'# 章\n\n## 小节\n\n```md\n# 代码示例\n```\n\n下划线标题\n---',extensions:markdown()});
    expect(tocRows(headings(state),new Set()).map(row=>row.heading.title)).toEqual(['章','小节','下划线标题']);
  });
  it('handles an empty document without a placeholder heading',()=>{expect(tocRows([],new Set())).toEqual([]);});
});
