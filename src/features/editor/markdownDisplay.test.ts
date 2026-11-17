import {describe,it,expect} from 'vitest';
import {EditorState} from '@codemirror/state';
import {markdownDisplayExtensions,displayModeField,markdownPreview,setDisplayMode,setPreviewFocus} from './markdownDisplay';
import {previewPlan,visibleReplacements} from './markdownPresentation';
import {visibleCount} from '../../shared/core';

const create=(doc:string)=>EditorState.create({doc,extensions:markdownDisplayExtensions});
const hidden=(state:EditorState,focused=false)=>visibleReplacements(state,focused).map(item=>state.sliceDoc(item.from,item.to));
describe('live Markdown display',()=>{
  it('defaults to rendered text with Markdown markers hidden without changing the source',()=>{
    const doc='# 标题\n\n**粗体** 和 *斜体*、~~删除线~~、`代码`。',state=create(doc);
    expect(state.field(displayModeField)).toBe('live');expect(state.doc.toString()).toBe(doc);
    const text=hidden(state);expect(text).toContain('# ');expect(text.filter(value=>value==='**')).toHaveLength(2);expect(text.filter(value=>value==='~~')).toHaveLength(2);expect(text.filter(value=>value==='`')).toHaveLength(2);
    expect(previewPlan(state).styles.map(style=>style.className)).toEqual(expect.arrayContaining(['cm-preview-h1','cm-preview-strong','cm-preview-emphasis','cm-preview-strike','cm-preview-inline-code']));
  });
  it('reveals only the edited line while keeping its formatting effects and other lines rendered',()=>{
    let state=create('# 标题\n\n**当前文字**\n\n## 另一标题');
    state=state.update({effects:setPreviewFocus.of(true),selection:{anchor:10}}).state;
    expect(hidden(state,true)).not.toContain('**');expect(hidden(state,true)).toEqual(expect.arrayContaining(['# ','## ']));
    expect(previewPlan(state).styles.some(style=>style.className==='cm-preview-strong')).toBe(true);
    state=state.update({selection:{anchor:0}}).state;
    expect(hidden(state,true)).not.toContain('# ');expect(hidden(state,true).filter(value=>value==='**')).toHaveLength(2);
  });
  it('hides the current line markers again on blur',()=>{
    let state=create('**文字**');state=state.update({effects:setPreviewFocus.of(true)}).state;
    const inlineCount=(state:EditorState)=>{let count=0;state.field(markdownPreview).between(0,state.doc.length,(_from,_to,decoration)=>{if(!decoration.spec.class?.startsWith('cm-typography-'))count++;});return count;};
    expect(inlineCount(state)).toBe(1);
    state=state.update({effects:setPreviewFocus.of(false)}).state;expect(inlineCount(state)).toBe(3);
  });
  it('switches to all-source mode and back without changing the text or selection',()=>{
    const initial=create('# 标题\n\n<u>文字</u>'),source=initial.update({effects:setDisplayMode.of('source')});
    expect(source.state.field(markdownPreview).size).toBe(0);expect(source.docChanged).toBe(false);expect(source.newSelection).toEqual(initial.selection);
    const live=source.state.update({effects:setDisplayMode.of('live')}).state;expect(live.field(markdownPreview).size).toBeGreaterThan(0);expect(live.doc.eq(initial.doc)).toBe(true);
  });
  it('shows code contents literally while hiding fence lines outside editing',()=>{
    const state=create('```md\n# 这是代码\n**照原样显示**\n```');
    expect(hidden(state).join('')).toBe('```md\n```');expect(previewPlan(state).styles.some(style=>style.className==='cm-preview-h1')).toBe(false);
    expect(previewPlan(state).styles.filter(style=>style.className==='cm-preview-code-line')).toHaveLength(2);
  });
  it('hides HTML underline and alignment markers while preserving their effects',()=>{
    const state=create('<div style="text-align: center;">\n\n<u>正文</u>\n\n</div>');
    expect(hidden(state).join('')).toContain('<div style="text-align: center;">');expect(hidden(state).join('')).toContain('</div>');
    const styles=previewPlan(state).styles;expect(styles.some(style=>style.align==='center')).toBe(true);expect(styles.some(style=>style.className==='cm-format-underline')).toBe(true);
    const items=visibleReplacements(state,false);for(let index=1;index<items.length;index++)expect(items[index].from).toBeGreaterThanOrEqual(items[index-1].to);
  });
  it('renders links, bullet lists, tasks and images without fetching external resources',()=>{
    const state=create('[链接文字](https://example.test)\n\n- 条目\n- [x] 完成\n\n![图片说明](https://example.test/private.png)');
    const items=visibleReplacements(state,false);expect(items.find(item=>item.kind==='bullet')?.text).toBe('•');expect(items.find(item=>item.kind==='task')?.text).toBe('☑');expect(items.find(item=>item.kind==='image')?.text).toBe('图片说明');
    expect(items.some(item=>state.sliceDoc(item.from,item.to)==='](https://example.test)')).toBe(true);
  });
  it('renders a table as cells and keeps it visible when editing a cell',()=>{
    const state=create('| 名称 | 值 |\n| --- | --- |\n| A | B |');
    const table=visibleReplacements(state,false).find(item=>item.kind==='table');expect(table?.rows?.map(row=>row.map(cell=>cell.text))).toEqual([['名称','值'],['A','B']]);
    const editing=state.update({selection:{anchor:30}}).state;expect(visibleReplacements(editing,true).some(item=>item.kind==='table')).toBe(true);
  });
  it('renders horizontal rules and Setext headings without displaying syntax',()=>{
    const state=create('标题\n===\n\n---');expect(hidden(state)).toContain('===\n');expect(visibleReplacements(state,false).some(item=>item.kind==='rule')).toBe(true);
  });
  it('counts displayed GFM text without list, task, strikethrough or table delimiters',()=>{
    expect(visibleCount('~~文字~~')).toBe(2);expect(visibleCount('- [x] 完成')).toBe(2);expect(visibleCount('| 甲 | 乙 |\n| --- | --- |\n| 丙 | 丁 |')).toBe(4);
  });
  it('reuses parsed presentation for cursor movement but invalidates it when text changes',()=>{
    const state=create('# 标题'),plan=previewPlan(state),moved=state.update({selection:{anchor:3}}).state;
    expect(previewPlan(moved)).toBe(plan);const changed=moved.update({changes:{from:4,insert:'新'}}).state;expect(previewPlan(changed)).not.toBe(plan);
  });
});
