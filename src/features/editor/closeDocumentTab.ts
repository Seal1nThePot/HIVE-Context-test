/** Keep the document session alive until saving and all current-operation checks succeed. */
export async function prepareDocumentTabClose(options:{blocked:()=>boolean;composing:()=>boolean;pending:()=>boolean;dirty:()=>boolean;save:()=>Promise<boolean>;valid:()=>boolean}):Promise<'ready'|'blocked'|'composing'|'pending'|'unsaved'|'changed'> {
  if(options.composing())return 'composing';
  if(options.blocked())return 'blocked';
  if(options.pending())return 'pending';
  if(options.dirty()&&(!await options.save()||options.dirty()))return 'unsaved';
  if(options.composing())return 'composing';
  if(!options.valid()||options.blocked()||options.pending()||options.dirty())return 'changed';
  return 'ready';
}
