import type {EditorSession} from '../editor/editorSessionTypes';
/** A deleted read-only image has no manuscript to convert into an unsaved draft.
 * Keep the tab/host and chat context when another composing window prevents closing. */
export function retireDeletedImage(session:EditorSession){
  if(!session.imagePath)return false;
  session.imagePath=undefined;session.disk=null;session.state=null;session.view=null;session.dirty=false;session.landing=true;
  session.contentVersion=(session.contentVersion||0)+1;
  return true;
}
