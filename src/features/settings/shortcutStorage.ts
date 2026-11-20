import {readShortcutBindings, type ShortcutBindings} from './shortcuts';

const key = 'hive.shortcuts.v1';
export type MermaidZoomGesture = 'ctrl-wheel' | 'wheel';

export function readShortcutPreferences() {
  try {
    const raw = localStorage.getItem(key);
    const data = JSON.parse(raw || 'null');
    return {
      bindings: readShortcutBindings(raw),
      mermaidZoom: data?.version === 1 && data.mermaidZoom === 'wheel' ? 'wheel' as const : 'ctrl-wheel' as const,
    };
  } catch {
    return {bindings: {}, mermaidZoom: 'ctrl-wheel' as const};
  }
}

export function writeShortcutPreferences(bindings: ShortcutBindings, mermaidZoom: MermaidZoomGesture) {
  localStorage.setItem(key, JSON.stringify({version: 1, bindings, mermaidZoom}));
}

export function getMermaidZoomGesture(): MermaidZoomGesture {
  // Read only on a wheel gesture, including in detached panel documents.
  try {
    const stored = JSON.parse(localStorage.getItem(key) || 'null');
    if (stored?.version === 1 && stored.mermaidZoom === 'wheel') return 'wheel';
  } catch { /* The default also works without local storage. */ }
  return 'ctrl-wheel';
}
