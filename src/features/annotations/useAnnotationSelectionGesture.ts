import {useLayoutEffect, useRef} from 'react';
import {EditorSelection} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';

export function useAnnotationSelectionGesture(owner: Document, onMark: (() => void) | undefined) {
  const callback = useRef(onMark);
  callback.current = onMark;
  const cancel = useRef<(() => void) | null>(null);
  useLayoutEffect(() => () => cancel.current?.(), [owner]);

  return function start(event: PointerEvent, editor: EditorView, toolbarMode: boolean) {
    const eligibleModifier = !event.metaKey && !event.shiftKey && !event.altKey && (event.ctrlKey || toolbarMode);
    const target = event.target as Element;
    const win = owner.defaultView;
    if (!win || !callback.current || !event.isPrimary || event.button !== 0 || editor.state.readOnly || editor.composing ||
      !target.closest('.cm-content') || target.closest('[data-table-widget]') || !eligibleModifier) return;

    cancel.current?.();
    const {pointerId, clientX, clientY} = event;
    const {doc, selection} = editor.state;
    let moved = false;
    let frame = 0;
    function track(pointer: PointerEvent) {
      if (pointer.pointerId === pointerId && Math.hypot(pointer.clientX - clientX, pointer.clientY - clientY) > 5) moved = true;
    }
    function finish(pointer: PointerEvent) {
      if (pointer.pointerId !== pointerId) return;
      track(pointer);
      cleanup();
      if (!moved) return;
      // Let CodeMirror finish its mouseup and mirror its selection from the source pane.
      frame = win!.requestAnimationFrame(() => {
        cleanup();
        if (!editor.dom.isConnected || editor.dom.ownerDocument !== owner || !editor.hasFocus || editor.composing || editor.state.readOnly || editor.state.doc !== doc) return;
        const current = editor.state.selection;
        if (current.eq(selection) || current.main.empty) return;
        // Ctrl also adds CodeMirror selection ranges. Persist only this gesture's active range.
        if (current.ranges.length > 1) editor.dispatch({selection: EditorSelection.create([current.main]), userEvent: 'select.pointer'});
        callback.current?.();
      });
      cancel.current = cleanup;
      win!.addEventListener('pointerdown', cleanup, true);
      win!.addEventListener('blur', cleanup);
    }
    function cleanup() {
      win!.cancelAnimationFrame(frame);
      win!.removeEventListener('pointerdown', cleanup, true);
      win!.removeEventListener('pointermove', track, true);
      win!.removeEventListener('pointerup', finish, true);
      win!.removeEventListener('pointercancel', cleanup, true);
      win!.removeEventListener('blur', cleanup);
      cancel.current = null;
    }
    cancel.current = cleanup;
    win.addEventListener('pointermove', track, true);
    win.addEventListener('pointerup', finish, true);
    win.addEventListener('pointercancel', cleanup, true);
    win.addEventListener('blur', cleanup);
  };
}
