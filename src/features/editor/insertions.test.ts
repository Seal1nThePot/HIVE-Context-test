import {describe,it,expect} from 'vitest';
import {EditorState} from '@codemirror/state';
import {history,undo} from '@codemirror/commands';
import {markdown} from '@codemirror/lang-markdown';
import {parser,GFM} from '@lezer/markdown';
import {imageMarkdown,insertImage,insertTable,localImageUrl} from './insertions';
import {lineFormatting} from './formatting';
import {previewPlan} from './markdownPresentation';
const state=(doc:string,anchor=doc.length,head=anchor)=>EditorState.create({doc,selection:{anchor,head},extensions:[history(),markdown()]});
describe('document insertion tools',()=>{
  it('inserts a GFM table with the requested size and selects its first header',()=>{
    const before=state('原文'),after=before.update(insertTable(before,2,3)).state,source=after.doc.toString();
    expect(source.startsWith('原文\n\n| 标题 1 | 标题 2 | 标题 3 |\n| --- | --- | --- |')).toBe(true);
    expect(source.split('\n').filter(line=>line.startsWith('|'))).toHaveLength(4);
    expect(after.sliceDoc(after.selection.main.from,after.selection.main.to)).toBe('标题 1');
    expect(parser.configure(GFM).parse(source).toString()).toContain('Table(');
    expect(previewPlan(after).replacements.find(item=>item.kind==='table')?.rows?.map(row=>row.length)).toEqual([3,3,3]);
    let restored=after;undo({state:after,dispatch:tr=>{restored=tr.state;}});expect(restored.doc.toString()).toBe('原文');
  });
  it('keeps selected manuscript text when inserting an image or table',()=>{
    const before=state('保留 选中 原文',3,5),after=before.update(insertImage(before,'文章pic/图 [1]#.png','图 [1]#.png')).state;
    expect(after.doc.toString()).toContain('保留 选中\n\n![图 \\[1\\]#](%E6%96%87%E7%AB%A0pic/%E5%9B%BE%20%5B1%5D%23.png)\n\n 原文');
    expect(before.doc.toString()).toBe('保留 选中 原文');
  });
  it('validates dimensions, read-only state and insertion inside code',()=>{
    for(const [rows,columns] of [[0,3],[21,2],[1,13],[1.5,2]])expect(()=>insertTable(state(''),rows,columns)).toThrow('1–20');
    expect(()=>insertImage(state('```\ncode\n```',5),'a.png','a.png')).toThrow('代码区域');
    expect(()=>insertTable(EditorState.create({extensions:EditorState.readOnly.of(true)}),1,1)).toThrow('只读');
  });
  it('provides fourth-level headings and removes deeper existing heading markers when changing the level',()=>{
    let value=state('###### 原标题');value=value.update(lineFormatting(value,4)).state;expect(value.doc.toString()).toBe('#### 原标题');
    value=value.update(lineFormatting(value,0)).state;expect(value.doc.toString()).toBe('原标题');
  });
  it('previews local images only through the workspace-bound endpoint, and escapes generated Markdown paths',()=>{
    const context={file:'资料/文章.md',workspace:'space'};
    const url=localImageUrl('文章pic/图.png',context)!;expect(url.startsWith('/api/images?')).toBe(true);
    expect(new URL(url,'http://localhost').searchParams.get('document')).toBe('资料/文章.md');
    expect(new URL(url,'http://localhost').searchParams.get('workspace')).toBe('space');
    for(const source of ['https://example.test/a.png','//example.test/a.png','data:image/png,a','file:///a.png','C:\\a.png'])expect(localImageUrl(source,context)).toBeNull();
    expect(localImageUrl('a.png',null)).toBeNull();expect(()=>imageMarkdown('https://example.test/a.png','a')).toThrow('相对路径');
    expect(previewPlan(state(imageMarkdown('文章pic/图 [1].png','图 [1].png'))).replacements.find(item=>item.kind==='image')?.text).toBe('图 [1]');
  });
});
