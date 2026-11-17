import {EditorView, lineNumbers} from '@codemirror/view';
import {StateField} from '@codemirror/state';

/** Visual line numbers only; mode changes do not modify the editor document. */
export const codeModeMarker = StateField.define({create:()=>true, update:value=>value});
export const codeModeExtensions = [
  codeModeMarker,
  lineNumbers(),
  EditorView.theme({
    '&[data-display-mode=live] .cm-gutters': {display:'none'},
    '&[data-display-mode=source] .cm-gutters': {
      backgroundColor:'var(--hive-document-bg, var(--bg))',
      color:'var(--muted)',
      borderRight:'1px solid var(--hive-surface-border, var(--line))',
    },
    '&[data-display-mode=source] .cm-lineNumbers .cm-gutterElement': {padding:'0 8px 0 6px', minWidth:'2.5em'},
  }),
];
