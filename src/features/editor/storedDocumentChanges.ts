import type {RefObject} from 'react';
import type {EditorState,Transaction} from '@codemirror/state';
import {headings,mapAnchor,type Anchor,type Proposal,type UndoEdit} from '../../shared/core';
import type {EditorSession} from './editorSessionTypes';

export function mapStoredSessionContext(context:EditorSession['context'],transaction:Transaction){
  if(!context||!transaction.docChanged)return;
  if(context.proposal)context.proposal=mapAnchor(context.proposal,transaction.changes);
  context.undo=context.undo.map(anchor=>mapAnchor(anchor,transaction.changes));
}

/** App retains these owners while its EditorView sleeps. Apply the real transaction,
 * including overlap invalidation, rather than waiting for a nonexistent ViewUpdate. */
export function applyStoredDocumentChange(owners:{editorState:RefObject<EditorState|null>;proposal:RefObject<Proposal|null>;requestAnchor:RefObject<Anchor|null>;undo:RefObject<UndoEdit[]>},transaction:Transaction){
  if(!transaction.docChanged)return null;
  owners.editorState.current=transaction.state;
  if(owners.proposal.current)owners.proposal.current=mapAnchor(owners.proposal.current,transaction.changes);
  if(owners.requestAnchor.current)owners.requestAnchor.current=mapAnchor(owners.requestAnchor.current,transaction.changes);
  owners.undo.current=owners.undo.current.map(anchor=>mapAnchor(anchor,transaction.changes));
  const range=transaction.state.selection.main;
  return {outline:headings(transaction.state),selection:{from:range.from,to:range.to,text:transaction.state.sliceDoc(range.from,range.to)}};
}
