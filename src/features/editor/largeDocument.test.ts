import {describe,it,expect,vi} from 'vitest';
import {EditorState,type Transaction} from '@codemirror/state';
import {history,undo,redo} from '@codemirror/commands';
import {parser,GFM} from '@lezer/markdown';
import {maskFrontmatter,documentFrontmatter,frontmatterBlock} from '../../shared/frontmatter';
import {headings} from '../../shared/core';
import {makeState} from './Editor';
import {markdownTree,markdownParseState} from './markdownParse';
import {markdownDisplayExtensions,markdownPreview,setDisplayMode,setPreviewFocus} from './markdownDisplay';
import {previewPlan,localPreviewUpdate} from './markdownPresentation';
import {TableWidget,cellContent,encodeCell} from './tableWidget';
import {tableCell,tableSegments,tableWidgetCellBudget} from './tableViewport';
import {annotationHighlights,setAnnotationMarks} from '../annotations/annotationDecorations';

const create=(doc:string)=>EditorState.create({doc,extensions:[markdownDisplayExtensions,annotationHighlights,history()]});
const tableText=(count:number)=>'| A | B | C | D | E | F |\n| --- | --- | --- | --- | --- | --- |\n'+Array.from({length:count},(_,i)=>`| r${i} | b | c | d | e | f |`).join('\n');

describe('large document response boundaries',()=>{
  it('does no full-document reads or decoration rebuild for cursor moves within the same active line',()=>{
    let state=create('**第一行**\n\n'+tableText(2000));
    state=state.update({effects:setPreviewFocus.of(true),selection:{anchor:3}}).state;
    const decorations=state.field(markdownPreview),full=vi.spyOn(state.doc,'toString');
    state=state.update({selection:{anchor:4}}).state;expect(state.field(markdownPreview)).toBe(decorations);
    state=state.update({selection:{anchor:11}}).state;expect(full).not.toHaveBeenCalled();
    const tree=markdownTree(state);expect(markdownTree(state.update({selection:{anchor:2}}).state)).toBe(tree);
  });
  it('starts an explicitly source-only session without building live-preview data first',()=>{
    const text=tableText(2000),state=makeState(text,()=>{},undefined,'source');
    expect(state.field(markdownPreview).size).toBe(0);expect(state.field(markdownParseState).tree).toBeUndefined();
    const moved=state.update({selection:{anchor:20}}).state;expect(moved.field(markdownParseState).tree).toBeUndefined();
    const live=moved.update({effects:setDisplayMode.of('live')}).state;
    expect(live.field(markdownPreview).size).toBeGreaterThan(0);expect(live.doc.toString()).toBe(text);
  });
  it('keeps every giant-table source row in bounded independent viewport widgets',()=>{
    const text=tableText(3000),state=create(text),table=previewPlan(state).replacements.find(item=>item.kind==='table')!;
    const segments=tableSegments(table,state.doc),widgets:TableWidget[]=[];
    state.field(markdownPreview).between(0,state.doc.length,(_from,_to,decoration)=>{if(decoration.spec.widget instanceof TableWidget)widgets.push(decoration.spec.widget);});
    expect(widgets).toHaveLength(segments.length);expect(widgets.length).toBeGreaterThan(90);
    for(let i=0;i<segments.length;i++){
      const segment=segments[i];expect((segment.toRow-segment.fromRow)*table.columns!).toBeLessThanOrEqual(tableWidgetCellBudget);
      expect(segment.from).toBe(i?segments[i-1].to+1:table.from);
      if(i)expect(state.sliceDoc(segments[i-1].to,segment.from)).toBe('\n');
    }
    expect(segments.at(-1)?.to).toBe(table.to);expect(state.doc.toString()).toBe(text);
    const serialize=vi.spyOn(JSON,'stringify');expect(widgets[0].eq(new TableWidget(table,null,[],0,segments[0].toRow))).toBe(true);expect(serialize).not.toHaveBeenCalled();
  });
  it('edits and undoes a late segment while preserving source syntax and annotation coordinates',()=>{
    const text=tableText(3000);let state=create(text);const table=previewPlan(state).replacements.find(item=>item.kind==='table')!;
    const part=cellContent(tableCell(table,2500,2)!,state.doc),mark=cellContent(tableCell(table,2501,2)!,state.doc);
    state=state.update({effects:setAnnotationMarks.of([{id:'late',from:mark.from,to:mark.to,note:'后部标注'}])}).state;
    const dispatch=(tr:Transaction)=>{state=tr.state;};
    state=state.update({changes:{from:part.from,to:part.to,insert:encodeCell('新|值')},userEvent:'input.type'}).state;
    expect(state.sliceDoc(part.from,part.from+4)).toBe('新\\|值');
    const marks:{from:number;to:number}[]=[];state.field(annotationHighlights).between(0,state.doc.length,(from,to)=>{marks.push({from,to});});
    expect(marks).toEqual([{from:mark.from+3,to:mark.to+3}]);
    expect(undo({state,dispatch})).toBe(true);expect(state.doc.toString()).toBe(text);
    expect(redo({state,dispatch})).toBe(true);expect(state.sliceDoc(part.from,part.from+4)).toBe('新\\|值');
  });
  it('does not allocate a dense virtual grid for a very sparse tall table',()=>{
    const text='| A | B | C | D | E | F |\n| --- | --- | --- | --- | --- | --- |\n'+'| x |\n'.repeat(12000),state=create(text),table=previewPlan(state).replacements.find(item=>item.kind==='table')!;
    expect(table.rows!.reduce((count,row)=>count+row.length,0)).toBeLessThan(13000);
    expect(tableCell(table,10000,5)).toMatchObject({virtual:5,text:'',trailing:true});
    expect(tableSegments(table,state.doc).every(segment=>(segment.toRow-segment.fromRow)*6<=tableWidgetCellBudget)).toBe(true);
  });
  it('keeps unusually wide tables as editable source with an explicit notice',()=>{
    const columns=tableWidgetCellBudget+1,text='| '+Array(columns).fill('A').join(' | ')+' |\n| '+Array(columns).fill('---').join(' | ')+' |\n| value |',state=create(text);
    let tables=0,notices=0;state.field(markdownPreview).between(0,state.doc.length,(_from,_to,decoration)=>{if(decoration.spec.widget instanceof TableWidget)tables++;if(decoration.spec.widget?.constructor.name==='WideTableNotice')notices++;});
    expect(tables).toBe(0);expect(notices).toBe(1);expect(state.doc.toString()).toBe(text);
    expect(state.update({changes:{from:text.length-2,insert:' edited'}}).state.doc.toString()).toContain('edited');
  });
});

describe('incremental Markdown semantics',()=>{
  it('patches safe middle and tail cell edits and history without parsing the whole table',()=>{
    let state=create('# 标题\n\n'+tableText(3000)+'\n\n## 后文');headings(state);
    for(const [row,col,value] of [[1500,2,'新|值\\末\n换行'],[3000,5,'尾部'],[0,0,'新标题']] as const){
      const table=previewPlan(state).replacements.find(item=>item.kind==='table')!,cell=tableCell(table,row,col)!,part=cellContent(cell,state.doc);
      state=state.update({changes:{from:part.from,to:part.to,insert:encodeCell(value)},userEvent:'input.type'}).state;
      expect(state.field(localPreviewUpdate)).not.toBeNull();expect(state.field(markdownParseState).tree).toBeUndefined();
      const full=vi.spyOn(state.doc,'toString');expect(headings(state).map(item=>item.title)).toEqual(['标题','后文']);expect(full).not.toHaveBeenCalled();
      const fresh=create(state.doc.toString());expect(previewPlan(state)).toEqual(previewPlan(fresh));expect(headings(state)).toEqual(headings(fresh));
    }
    const dispatch=(tr:Transaction)=>{state=tr.state;};
    expect(undo({state,dispatch})).toBe(true);expect(state.field(localPreviewUpdate)).not.toBeNull();
    expect(previewPlan(state)).toEqual(previewPlan(create(state.doc.toString())));
    expect(redo({state,dispatch})).toBe(true);expect(state.field(localPreviewUpdate)).not.toBeNull();
    expect(previewPlan(state)).toEqual(previewPlan(create(state.doc.toString())));
  });
  it('invalidates the cell fast path for unescaped pipes, line breaks, dangling escapes and separator edits',()=>{
    const original='| A | B |\n| --- | --- |\n| value | other |';
    for(const inserted of ['new | column','\\\nnew line','\nnew line','\\','<u>marked</u>']){
      const state=create(original),table=previewPlan(state).replacements.find(item=>item.kind==='table')!,cell=tableCell(table,1,0)!;
      const changed=state.update({changes:{from:cell.to,insert:inserted}}).state;
      expect(changed.field(localPreviewUpdate)).toBeNull();expect(previewPlan(changed)).toEqual(previewPlan(create(changed.doc.toString())));
    }
    const state=create(original),separator=original.indexOf('---'),changed=state.update({changes:{from:separator,to:separator+3,insert:'not separator'}}).state;
    expect(changed.field(localPreviewUpdate)).toBeNull();expect(previewPlan(changed)).toEqual(previewPlan(create(changed.doc.toString())));
  });
  it('matches a fresh parse across edits and changing metadata boundaries',()=>{
    let state=create('---\ntitle: heading\n\n# 原本不是元数据\n\n'+tableText(60));
    const verify=()=>expect(markdownTree(state).toString()).toBe(parser.configure(GFM).parse(maskFrontmatter(state.doc.toString())).toString());
    verify();
    for(const change of [{from:state.doc.length,insert:'\n---\n# 正文标题'}, {from:0,to:4,insert:''},{from:0,insert:'---\n'}, {from:5,to:8,insert:'changed'}]){state=state.update({changes:change}).state;verify();}
    const full=vi.spyOn(state.doc,'toString');expect(headings(state).map(heading=>heading.title)).toEqual(['正文标题']);expect(full).not.toHaveBeenCalled();
  });
  it('reads the same metadata bounds as the string API without expanding ordinary notes',()=>{
    for(const text of ['正文\n'.repeat(20000),'---\na: 1\n---\n正文','\uFEFF---\na: 1\n...','---\n未关闭']){
      const state=EditorState.create({doc:text}),full=vi.spyOn(state.doc,'toString');expect(documentFrontmatter(state.doc)).toEqual(frontmatterBlock(text));expect(full).not.toHaveBeenCalled();
    }
  });
});
