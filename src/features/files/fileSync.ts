export type FileBaseline={text:string;hash:string};
/** A clean editor may adopt disk changes. Divergent local edits must stay in memory. */
export function diskSyncDecision(local:{baseline:FileBaseline;text:string}[],remote:FileBaseline):'unchanged'|'adopt'|'conflict'{
  if(local.every(item=>item.baseline.hash===remote.hash))return 'unchanged';
  if(local.some(item=>item.text!==item.baseline.text)&&!local.every(item=>item.text===remote.text))return 'conflict';
  return 'adopt';
}
