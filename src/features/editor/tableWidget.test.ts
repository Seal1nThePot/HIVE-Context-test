import {describe,it,expect} from 'vitest';
import {EditorState} from '@codemirror/state';
import {previewPlan} from './markdownPresentation';
import {cellContent,decodeCell,encodeCell,tableSizeKey,tableRectangle} from './tableWidget';
import {markdownDisplayExtensions,markdownPreview} from './markdownDisplay';
import {annotationHighlights,setAnnotationMarks} from '../annotations/annotationDecorations';

describe('table source editing',()=>{
  it('normalizes a rectangular drag in either direction',()=>{expect(tableRectangle({row:4,col:3},{row:1,col:0})).toEqual({top:1,bottom:4,left:0,right:3});});
  it('round trips pipes, backslashes, and line breaks without creating table syntax',()=>{
    const value='甲 | 乙\\丙\n丁';expect(encodeCell(value)).toBe('甲 \\| 乙\\\\丙<br>丁');expect(decodeCell(encodeCell(value))).toBe(value);
  });
  it('locates only content, preserving padding, separators, and alignment',()=>{
    const doc='| 甲 | 乙 |\n| :--- | ---: |\n|  A  | B |';const state=EditorState.create({doc});const table=previewPlan(state).replacements.find(x=>x.kind==='table')!;const part=cellContent(table.rows![1][0],doc);const next=state.update({changes:{from:part.from,to:part.to,insert:encodeCell('X|Y')}}).state.doc.toString();expect(next).toBe('| 甲 | 乙 |\n| :--- | ---: |\n|  X\\|Y  | B |');
  });
  it('uses actual parsed table order, independent of horizontal rules',()=>{
    const tables=previewPlan(EditorState.create({doc:'***\n\n| A |\n| --- |\n\n---\n\n| B |\n| --- |'})).replacements.filter(x=>x.kind==='table');
    expect(tables.map(t=>t.tableOrdinal)).toEqual([0,1]);const context={workspace:'workspace',file:'file.md'};expect(tableSizeKey(context,tables[0])).not.toBe(tableSizeKey(context,tables[1]));expect(tableSizeKey({...context,file:'other.md'},tables[0])).not.toBe(tableSizeKey(context,tables[0]));
  });
  it('updates table widget marks when annotation effects change',()=>{
    const doc='| A |\n| --- |',state=EditorState.create({doc,extensions:[annotationHighlights,markdownDisplayExtensions]});const updated=state.update({effects:setAnnotationMarks.of([{id:'id-1',from:2,to:3,note:'note'}])}).state;let marks:unknown;updated.field(markdownPreview).between(0,doc.length,(_from,_to,decoration)=>{const widget=decoration.spec.widget;if(widget?.constructor.name==='TableWidget')marks=(widget as unknown as {marks:unknown}).marks;});expect(marks).toEqual([{id:'id-1',from:2,to:3,note:'note'}]);
  });
  it('locates padded missing cells at the end of their own row',()=>{
    const doc='| A | B | C |\n| --- | --- | --- |\n| x |';const table=previewPlan(EditorState.create({doc})).replacements.find(x=>x.kind==='table')!;expect(table.rows![1]).toHaveLength(3);expect(table.rows![1][1].virtual).toBe(1);expect(table.rows![1][1].from).toBe(doc.length);
  });
});

