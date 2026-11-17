import type {Transaction} from '@codemirror/state';
import {documentMatchesText} from '../editor/documentText';
import {mapAnnotations,type TextAnnotation} from './annotations';

/** Every same-path view receives disk changes, but the one dataset must map once. */
export function mapStoredAnnotationRecord(record:{text:string;items:TextAnnotation[]},transaction:Transaction){
  if(!transaction.docChanged||!documentMatchesText(transaction.startState.doc,record.text))return false;
  record.items=mapAnnotations(record.items,transaction.changes);record.text=transaction.state.doc.toString();return true;
}
