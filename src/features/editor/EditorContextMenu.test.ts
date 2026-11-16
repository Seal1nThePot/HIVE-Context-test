import {describe,it,expect} from 'vitest';
import {EditorSelection,EditorState} from '@codemirror/state';
import {clipboardChange} from './EditorContextMenu';

describe('clipboard edits',()=>{
  it('replaces the captured selection rather than the later cursor',()=>{
    const state=EditorState.create({doc:'alpha beta',selection:{anchor:10}});
    const changed=state.update(clipboardChange(state,EditorSelection.create([EditorSelection.range(0,5)]),'new')).state;
    expect(changed.doc.toString()).toBe('new beta');expect(changed.selection.main.head).toBe(3);
  });
  it('cuts multiple selected ranges in a single transaction',()=>{
    const state=EditorState.create({doc:'one two three',extensions:[EditorState.allowMultipleSelections.of(true)]});
    const selection=EditorSelection.create([EditorSelection.range(0,3),EditorSelection.range(8,13)]);
    const changed=state.update(clipboardChange(state,selection,'')).state;
    expect(changed.doc.toString()).toBe(' two ');expect(changed.selection.ranges.map(r=>r.head)).toEqual([0,5]);
  });
});
