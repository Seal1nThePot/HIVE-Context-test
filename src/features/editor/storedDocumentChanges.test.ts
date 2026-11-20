import {describe,it,expect,vi} from 'vitest';
import {EditorState} from '@codemirror/state';
import {applyStoredDocumentChange} from './storedDocumentChanges';
import {mapStoredAnnotationRecord} from '../annotations/storedAnnotationChanges';
import type {Proposal,UndoEdit} from '../../shared/core';
import type {TextAnnotation} from '../annotations/annotations';

const original='# title\n\none target three';
const anchor={from:original.indexOf('target'),to:original.indexOf('target')+6,original:'target',file:'same.md',stale:false};
const proposal={...anchor,id:'proposal',text:'replacement',reason:'reason',mode:'edit',count:3,node:'node'} as Proposal;
const annotation={...anchor,id:'annotation',source:'document',note:'note',createdAt:'now'} as TextAnnotation;
describe('stored document transaction protection',()=>{
  it('keeps a pending proposal, request and AI undo stale after a disk overlap is later restored',()=>{
    const state=EditorState.create({doc:original}),owners={proposal:{current:proposal},requestAnchor:{current:{...anchor}},undo:{current:[{...anchor,before:'old'} as UndoEdit]}};
    const changed=state.update({changes:{from:anchor.from,to:anchor.to,insert:'changed'}});applyStoredDocumentChange(owners,changed);
    const restored=changed.state.update({changes:{from:anchor.from,to:anchor.from+7,insert:'target'}});const derived=applyStoredDocumentChange(owners,restored)!;
    expect(restored.state.doc.toString()).toBe(original);
    expect(owners.proposal.current.stale).toBe(true);expect(owners.requestAnchor.current.stale).toBe(true);expect(owners.undo.current[0].stale).toBe(true);expect(derived.outline[0].title).toBe('title');
  });
  it('maps nonoverlapping changes and restores heading/selection derived values without a View',()=>{
    const state=EditorState.create({doc:original,selection:{anchor:anchor.from,head:anchor.to}}),owners={proposal:{current:proposal},requestAnchor:{current:{...anchor}},undo:{current:[] as UndoEdit[]}};
    const transaction=state.update({changes:{from:0,insert:'# earlier\n\n'}}),derived=applyStoredDocumentChange(owners,transaction)!;
    expect(owners.proposal.current.from).toBe(anchor.from+11);expect(owners.proposal.current.stale).toBe(false);expect(derived.outline.map(heading=>heading.title)).toEqual(['earlier','title']);expect(derived.selection.text).toBe('target');
  });
  it('maps one annotation dataset once across same-path sleeping views and never revives overlap after restore',()=>{
    const state=EditorState.create({doc:original}),record={text:original,items:[annotation]},other=EditorState.create({doc:state.doc});
    const transaction=state.update({changes:{from:anchor.from,to:anchor.to,insert:'changed'}}),duplicate=other.update({changes:transaction.changes});
    expect(mapStoredAnnotationRecord(record,transaction)).toBe(true);const mapped=record.items[0];expect(mapStoredAnnotationRecord(record,duplicate)).toBe(false);expect(record.items[0]).toBe(mapped);
    const restore=transaction.state.update({changes:{from:anchor.from,to:anchor.from+7,insert:'target'}});expect(mapStoredAnnotationRecord(record,restore)).toBe(true);expect(record.text).toBe(original);expect(record.items[0].stale).toBe(true);
  });
  it('does not read text for a stored selection-only transaction and maps outside edits correctly',()=>{
    const state=EditorState.create({doc:original}),record={text:original,items:[annotation]},read=vi.spyOn(state.doc,'toString');
    expect(mapStoredAnnotationRecord(record,state.update({selection:{anchor:2}}))).toBe(false);expect(read).not.toHaveBeenCalled();
    expect(mapStoredAnnotationRecord(record,state.update({changes:{from:0,insert:'prefix '}}))).toBe(true);expect(record.items[0].from).toBe(anchor.from+7);expect(record.items[0].stale).toBe(false);
  });
});
