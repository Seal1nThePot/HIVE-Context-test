import {describe,it,expect,vi} from 'vitest';
import {EditorState,type Transaction} from '@codemirror/state';
import {history,undo,redo} from '@codemirror/commands';
import {documentMatchesText} from './documentText';
import {canApplyToDocument} from '../../shared/core';

describe('save baseline comparisons',()=>{
  it('compares rope chunks without expanding the whole note, including Unicode and empty notes',()=>{
    for(const text of ['', '𠮷🙂\n中文\n', '正文\n'.repeat(50000)]){
      const doc=EditorState.create({doc:text}).doc,full=vi.spyOn(doc,'toString');
      expect(documentMatchesText(doc,text)).toBe(true);expect(documentMatchesText(doc,text+'x')).toBe(false);
      expect(documentMatchesText(doc,text)).toBe(true);expect(full).not.toHaveBeenCalled();
    }
  });
  it('returns clean after undo to the saved content and rechecks a changed save baseline',()=>{
    const baseline='原文\n第二行';let state=EditorState.create({doc:baseline,extensions:history()});
    const dispatch=(tr:Transaction)=>{state=tr.state;};
    state=state.update({changes:{from:1,insert:'新'},userEvent:'input.type'}).state;
    const changed=state.doc;expect(documentMatchesText(changed,baseline)).toBe(false);
    expect(undo({state,dispatch})).toBe(true);expect(documentMatchesText(state.doc,baseline)).toBe(true);
    expect(redo({state,dispatch})).toBe(true);expect(documentMatchesText(state.doc,baseline)).toBe(false);
    expect(documentMatchesText(changed,'原新文\n第二行')).toBe(true);
  });
  it('checks an AI pending range without reading unrelated content, retaining stale and file guards',()=>{
    const text='正文\n'.repeat(50000)+'候选原文',doc=EditorState.create({doc:text}).doc,full=vi.spyOn(doc,'toString'),read=vi.spyOn(doc,'sliceString');
    const anchor={from:text.length-4,to:text.length,original:'候选原文',file:'test.md',stale:false};
    expect(canApplyToDocument(anchor,doc,'test.md')).toBe(true);expect(read.mock.calls).toEqual([[anchor.from,anchor.to]]);expect(full).not.toHaveBeenCalled();
    expect(canApplyToDocument({...anchor,stale:true},doc,'test.md')).toBe(false);expect(canApplyToDocument(anchor,doc,'else.md')).toBe(false);
    expect(canApplyToDocument({...anchor,to:doc.length+1},doc,'test.md')).toBe(false);
  });
});
