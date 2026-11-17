import {describe,it,expect} from 'vitest';
import {EditorState} from '@codemirror/state';
import {alignmentDelta,projectedBreakGaps,setProjectedBreakGaps,projectedBreaks,setProjectedBreaks,splitPadding,setSplitPadding,splitBlockPadding,setSplitBlockPadding} from './splitAlignment';

describe('split alignment decorations',()=>{
  it('recomputes space from natural heights without accumulating prior padding',()=>{
    expect(alignmentDelta(60,100,10,0)).toEqual({left:50,right:0});
    expect(alignmentDelta(120,80,0,20)).toEqual({left:0,right:60});
    expect(alignmentDelta(90,90)).toEqual({left:0,right:0});
  });
  it('maps projected break positions through edits without changing document text',()=>{
    let state=EditorState.create({doc:'abcd\nxyz',extensions:[projectedBreakGaps,projectedBreaks,splitPadding,splitBlockPadding]});
    state=state.update({effects:[setProjectedBreaks.of(new Map([[0,[2,3]]])),setProjectedBreakGaps.of(new Map([[2,50]])),setSplitPadding.of(new Map([[0,20]])),setSplitBlockPadding.of(new Map([[4,30]]))]}).state;
    expect(state.doc.toString()).toBe('abcd\nxyz');
    state=state.update({changes:{from:1,insert:'Q'}}).state;
    expect(state.field(projectedBreaks).get(0)).toEqual([3,4]);
    expect(state.field(splitPadding).get(0)).toBe(20);expect(state.field(projectedBreakGaps).get(3)).toBe(50);
    expect(state.field(splitBlockPadding).size).toBe(0);
  });
  it('drops mapped breaks outside a line after deletion',()=>{
    let state=EditorState.create({doc:'abcdef',extensions:[projectedBreakGaps,projectedBreaks]});
    state=state.update({effects:setProjectedBreaks.of(new Map([[0,[1,2,3,4,5]]]))}).state;
    state=state.update({changes:{from:1,to:5}}).state;
    expect(state.field(projectedBreaks).get(0)).toEqual([1]);
  });
});
