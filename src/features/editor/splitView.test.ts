import {describe,it,expect} from 'vitest';
import {EditorState,EditorSelection} from '@codemirror/state';
import {history,undo,redo} from '@codemirror/commands';
import {sourceTransaction,mirrorTransaction,underlyingDisplayMode} from './splitView';

describe('split view transactions',()=>{
  it('shares edits, selections and a single authoritative undo history in both directions',()=>{
    let main=EditorState.create({doc:'# 标题\n文字',extensions:[history()]}),source=EditorState.create({doc:main.doc});
    const applyMain=(tr:ReturnType<EditorState['update']>)=>{main=tr.state;source=mirrorTransaction(source,tr).state;};
    const sourceEdit=source.update({changes:{from:source.doc.length,insert:' A'},selection:EditorSelection.cursor(source.doc.length+2),userEvent:'input.type'});
    applyMain(main.update(sourceTransaction(sourceEdit)));
    expect(main.doc.toString()).toBe('# 标题\n文字 A');expect(source.doc.eq(main.doc)).toBe(true);expect(source.selection.main.head).toBe(main.selection.main.head);
    applyMain(main.update({changes:{from:0,insert:'B'},userEvent:'input.type'}));
    expect(source.doc.eq(main.doc)).toBe(true);
    const target={get state(){return main;},dispatch:applyMain};
    expect(undo(target)).toBe(true);expect(source.doc.eq(main.doc)).toBe(true);
    expect(redo(target)).toBe(true);expect(source.doc.eq(main.doc)).toBe(true);
    const saved=main;main=saved;expect(main.doc.toString()).toBe('B# 标题\n文字 A');
  });
  it('keeps caret scroll requests local to their originating pane',()=>{const state=EditorState.create({doc:'abc'}),tr=state.update({selection:{anchor:2},scrollIntoView:true});expect(sourceTransaction(tr).scrollIntoView).toBe(false);expect(mirrorTransaction(state,tr).scrollIntoView).toBe(false);});
  it('keeps the native pointer event on the clicked pane while sharing its selection',()=>{
    const state=EditorState.create({doc:'abc'});
    const pointer=state.update({selection:{anchor:2},userEvent:'select.pointer'});
    const forwarded=state.update(sourceTransaction(pointer));
    expect(forwarded.newSelection.main.head).toBe(2);
    expect(forwarded.isUserEvent('select.pointer')).toBe(false);
    expect(forwarded.isUserEvent('select')).toBe(true);
  });
  it('uses the live presentation for split mode',()=>{expect(underlyingDisplayMode('split')).toBe('live');expect(underlyingDisplayMode('source')).toBe('source');});
});
