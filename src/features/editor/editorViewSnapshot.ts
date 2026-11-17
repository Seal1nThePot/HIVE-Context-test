import type {EditorSession} from './editorSessionTypes';

/** A hidden element may report zero; retain the last visible scroll rather than overwrite it. */
export function captureEditorView(session:EditorSession){
  const view=session.view;if(!view)return;
  session.state=view.state;
  if(view.dom.getClientRects().length){session.restoreScroll=view.scrollDOM.scrollTop;session.restoreScrollLeft=view.scrollDOM.scrollLeft;}
}
