export type FileBaseline={text:string;hash:string};
import type {Text} from '@codemirror/state';
import {documentMatchesText} from '../editor/documentText';
const matches=(source:string|Text,text:string)=>typeof source==='string'?source===text:documentMatchesText(source,text);
/** A clean editor may adopt disk changes. Divergent local edits must stay in memory. */
export function diskSyncDecision(local:{baseline:FileBaseline;text:string|Text}[],remote:FileBaseline):'unchanged'|'adopt'|'conflict'{
  if(local.every(item=>item.baseline.hash===remote.hash))return 'unchanged';
  if(local.some(item=>!matches(item.text,item.baseline.text))&&!local.every(item=>matches(item.text,remote.text)))return 'conflict';
  return 'adopt';
}
