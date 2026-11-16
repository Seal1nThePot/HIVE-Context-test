import {describe,expect,it} from 'vitest';
import {EditorState} from '@codemirror/state';
import {history,undo} from '@codemirror/commands';
import {markdown} from '@codemirror/lang-markdown';
import {parse} from 'yaml';
import {frontmatterBlock} from '../../shared/frontmatter';
import {headings,visibleCount} from '../../shared/core';
import {previewPlan} from './markdownPresentation';
import {notePropertiesChange,notePropertiesTransaction,readNoteProperties,type NoteProperty} from './noteProperties';

const field=(key:string,value:string,type:NoteProperty['type']='text'):NoteProperty=>({id:key,key,value,type});
const apply=(source:string,rows:NoteProperty[])=>{const change=notePropertiesChange(source,rows);return change?source.slice(0,change.from)+change.insert+source.slice(change.to):source;};
const yaml=(source:string)=>{const block=frontmatterBlock(source)!;return parse(source.slice(block.contentFrom,block.contentTo));};
describe('note properties',()=>{
  it('keeps explicit date and datetime types, local times and offsets across reopen without changing date-like text',()=>{
    let source=apply('# 正文',[field('日期','2026-11-16','date'),field('时间','2026-11-16T15:30:00+08:00','datetime'),field('本地时间','2026-11-16T15:30','datetime'),field('普通文本','2026-11-16')]);
    const rows=readNoteProperties(source);expect(rows.map(row=>row.type)).toEqual(['date','datetime','datetime','text']);expect(rows.map(row=>row.value)).toEqual(['2026-11-16','2026-11-16T15:30:00+08:00','2026-11-16T15:30','2026-11-16']);
    expect(notePropertiesChange(source,rows)).toBeNull();rows[0].type='text';source=apply(source,rows);expect(readNoteProperties(source)[0].type).toBe('text');expect(source.endsWith('# 正文')).toBe(true);
  });
  it.each([['date','2026-02-30'],['date','2026-13-01'],['datetime','2026-11-16T25:30'],['datetime','2026-11-16T15:60'],['datetime','2026-11-16T15:30:00+24:00']])('rejects invalid %s value %s', (type,value)=>{
    expect(()=>apply('正文',[field('日期',value,type as NoteProperty['type'])])).toThrow('有效');
  });
  it('inserts one YAML block above the body with custom names and typed values',()=>{
    const source='# 正文\n\n原有内容。',next=apply(source,[field('自定义','123'),field('priority','3','number'),field('done','true','boolean'),field('tags','写作\n随笔','list')]);
    expect(next.endsWith(source)).toBe(true);expect(yaml(next)).toEqual({'自定义':'123',priority:3,done:true,tags:['写作','随笔']});
    expect(next.match(/^---$/gm)).toHaveLength(2);expect(readNoteProperties(next).map(row=>row.type)).toEqual(['text','number','boolean','list']);
  });
  it('updates and renames existing properties while retaining comments, nested values and the exact body',()=>{
    const source='---\n# retained\ntitle: "标题" # title comment\nnested:\n  score: 5\n  choices: [a, b]\ntags: [old]\n---\n\n# 正文\n一行\n',rows=readNoteProperties(source);
    expect(notePropertiesChange(source,rows)).toBeNull();rows[0]={...rows[0],key:'标题',value:'新标题'};
    const next=apply(source,rows);expect(next).toContain('# retained');expect(next).toContain('# title comment');expect(yaml(next)).toMatchObject({'标题':'新标题',nested:{score:5,choices:['a','b']},tags:['old']});expect(next.slice(frontmatterBlock(next)!.to)).toBe(source.slice(frontmatterBlock(source)!.to));
  });
  it('retains anchors and aliases and refuses to remove a referenced anchor',()=>{
    const source='---\nbase: &base\n  x: 2\ncopy: *base\nother: old\n---\n正文';
    const rows=readNoteProperties(source);rows[2].value='new';const next=apply(source,rows);
    expect(next).toContain('&base');expect(next).toContain('*base');expect(yaml(next).copy).toEqual({x:2});
    expect(()=>apply(source,rows.slice(1))).toThrow('引用');
  });
  it.each([false,true])('retains an edited anchor, with a referring alias: %s',referenced=>{
    const source='---\ntitle: &title old\n'+(referenced?'copy: *title\n':'')+'---\n正文',rows=readNoteProperties(source);rows[0].value='new';
    const next=apply(source,rows);expect(next).toContain('&title');expect(yaml(next).title).toBe('new');if(referenced)expect(yaml(next).copy).toBe('new');
  });
  it('keeps BOM, CRLF, an alternate end marker and multiline text',()=>{
    const source='\uFEFF---\r\ntitle: old\r\n...\r\n\r\n正文\r\n',rows=readNoteProperties(source);rows[0].value='一行\n下一行';
    const next=apply(source,rows);expect(next.startsWith('\uFEFF---\r\n')).toBe(true);expect(next).toContain('...\r\n');expect(next.endsWith('\r\n正文\r\n')).toBe(true);expect(yaml(next).title).toBe('一行\n下一行');
  });
  it('rejects malformed maps, duplicate names, invalid numbers and invalid nested YAML',()=>{
    expect(()=>readNoteProperties('---\na: [\n---\n正文')).toThrow('YAML');expect(()=>readNoteProperties('---\n- list\n---\n正文')).toThrow('属性名');
    expect(()=>apply('正文',[field('a','one'),field('a','two')])).toThrow('重复');expect(()=>apply('正文',[field('','value')])).toThrow('名称');expect(()=>apply('正文',[field('a','no','number')])).toThrow('数字');expect(()=>apply('正文',[field('a','[broken','yaml')])).toThrow('YAML');
  });
  it('ignores a blank new row, removes all fields intentionally, and leaves separators in the body alone',()=>{
    expect(notePropertiesChange('正文',[field('','')])).toBeNull();expect(apply('---\na: 1\n---\n\n正文',[])).toBe('\n正文');
    expect(frontmatterBlock('# 正文\n---\n后文')).toBeNull();expect(frontmatterBlock('---\n只有横线')).toBeNull();
  });
  it('changes only the metadata range, maps body selections, and supports one undo',()=>{
    const source='# 正文\n\n保留正文。';let state=EditorState.create({doc:source,selection:{anchor:source.length},extensions:[history()]});
    const transaction=notePropertiesTransaction(state,[field('title','测试')])!;state=state.update(transaction).state;
    expect(state.sliceDoc(state.selection.main.head-'保留正文。'.length)).toBe('保留正文。');
    expect(undo({state,dispatch:tr=>{state=tr.state;}})).toBe(true);expect(state.doc.toString()).toBe(source);
    const readOnly=EditorState.create({doc:source,extensions:EditorState.readOnly.of(true)});expect(()=>notePropertiesTransaction(readOnly,[field('a','b')])).toThrow('只读');
  });
  it('keeps a cursor at the start of a new note in the body after properties are inserted',()=>{
    const state=EditorState.create({doc:'# 正文'}),next=state.update(notePropertiesTransaction(state,[field('title','测试')])!).state;
    expect(next.doc.lineAt(next.selection.main.head).text).toBe('# 正文');expect(next.selection.main.head).toBeGreaterThanOrEqual(frontmatterBlock(next.doc.toString())!.to);
  });
  it.each([0,5])('moves a cursor inside the old property block back to the body, from %s',anchor=>{
    const source='---\ntitle: old\n---\n\n# 正文',state=EditorState.create({doc:source,selection:{anchor}}),rows=readNoteProperties(source);rows[0].value='new';
    const next=state.update(notePropertiesTransaction(state,rows)!).state;expect(next.selection.main.head).toBeGreaterThanOrEqual(frontmatterBlock(next.doc.toString())!.to);
  });
  it('keeps YAML out of counts, the title directory and Markdown styles while showing a compact property block',()=>{
    const source='---\n# 属性注释不是标题\ntitle: 标题属性\ntags: [随笔]\n---\n\n# 正文\n\n内容。';const state=EditorState.create({doc:source,extensions:[markdown()]});
    expect(visibleCount(source)).toBe(visibleCount('# 正文\n\n内容。'));expect(headings(state).map(item=>item.title)).toEqual(['正文']);
    const plan=previewPlan(state);expect(plan.replacements.filter(item=>item.kind==='properties')).toHaveLength(1);expect(plan.styles.every(style=>style.from>=frontmatterBlock(source)!.to)).toBe(true);
  });
});
