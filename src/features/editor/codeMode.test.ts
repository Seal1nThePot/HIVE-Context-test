import {describe, expect, it} from 'vitest';
import {EditorState} from '@codemirror/state';
import {codeModeExtensions, codeModeMarker} from './codeMode';
import {displayModeField, setDisplayMode} from './markdownDisplay';

describe('code mode',()=>{
  it('changes display without modifying the document or selection',()=>{
    const initial=EditorState.create({doc:'第一行\n**第二行**',selection:{anchor:4},extensions:[displayModeField,codeModeExtensions]});
    const tr=initial.update({effects:setDisplayMode.of('source')});
    expect(initial.field(codeModeMarker)).toBe(true);
    expect(tr.docChanged).toBe(false);
    expect(tr.state.doc.eq(initial.doc)).toBe(true);
    expect(tr.state.selection.eq(initial.selection)).toBe(true);
    expect(tr.state.field(displayModeField)).toBe('source');
    expect(tr.state.update({effects:setDisplayMode.of('live')}).state.doc.eq(initial.doc)).toBe(true);
  });
});
