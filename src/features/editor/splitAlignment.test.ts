import {describe,it,expect} from 'vitest';
import {EditorState} from '@codemirror/state';
import {alignmentDelta,paragraphLines,splitPadding,setSplitPadding,splitBlockPadding,setSplitBlockPadding} from './splitAlignment';

describe('split alignment decorations',()=>{
  it('recomputes space from natural heights without accumulating prior padding',()=>{
    expect(alignmentDelta(60,100,10,0)).toEqual({left:50,right:0});
    expect(alignmentDelta(120,80,0,20)).toEqual({left:0,right:60});
    expect(alignmentDelta(90,90)).toEqual({left:0,right:0});
  });
  it('treats Markdown soft lines as one paragraph and keeps headings and tables separate',()=>{
    const state=EditorState.create({doc:'# Title\n\nFirst line\nSecond **line**\n\n| A | B |\n| - | - |\n| a | b |'});
    const paragraph=paragraphLines(state,state.doc.line(4).from);
    expect([paragraph.first.number,paragraph.last.number]).toEqual([3,4]);
    for(const number of [1,2,5,6,7,8]){
      const range=paragraphLines(state,state.doc.line(number).from);
      expect([range.first.number,range.last.number]).toEqual([number,number]);
    }
  });
  it('retains padding on unaffected block boundaries after editing',()=>{
    const state=EditorState.create({doc:'abcd\nxyz',extensions:[splitPadding,splitBlockPadding]})
      .update({effects:[setSplitPadding.of(new Map([[5,20]])),setSplitBlockPadding.of(new Map([[4,30]]))]}).state;
    const edited=state.update({changes:{from:1,insert:'Q'}}).state;
    expect(edited.doc.toString()).toBe('aQbcd\nxyz');
    expect(edited.field(splitPadding).get(6)).toBe(20);
    expect(edited.field(splitBlockPadding).get(5)).toBe(30);
  });
});
