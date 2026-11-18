import type {EditorSession} from '../editor/editorSessionTypes';
import type {FileAction} from './FileExplorer';

const filePath=(session:EditorSession)=>session.imagePath||session.disk?.path;

/** A folder action covers its descendants, but never a sibling with the same prefix. */
export function fileActionContainsPath(action:FileAction,path:string){
  return !!action.path&&(path===action.path||path.startsWith(action.path+'/'));
}

export function affectedFileSessions(actions:FileAction[],sessions:Iterable<EditorSession>){
  return [...sessions].filter(session=>filePath(session)&&actions.some(action=>action.action!=='reveal'&&fileActionContainsPath(action,filePath(session)!)));
}

type FileOperationChecks={
  actions:FileAction[];
  sessions:()=>Map<string,EditorSession>;
  proposalFor:(id:string)=>unknown;
  assertAvailable:()=>void;
  flush:()=>Promise<void>;
  saveSession:(id:string,quiet?:boolean)=>Promise<boolean>;
};

/** Check the whole set before any filesystem mutation; saving never authorizes later edits. */
export async function checkFileOperations(options:FileOperationChecks){
  const {actions,sessions,proposalFor,assertAvailable,flush,saveSession}=options;
  assertAvailable();
  const affected=affectedFileSessions(actions,sessions().values());
  for(const session of affected){
    if(actions.some(action=>['move','rename','trash'].includes(action.action)&&fileActionContainsPath(action,filePath(session)!))&&proposalFor(session.id))
      throw new Error('请先处理这个文件的待审建议，再整理文件。');
  }
  const snapshots=affected.map(session=>({session,path:filePath(session)!,doc:(session.view?.state||session.state)?.doc,version:session.contentVersion||0,proposal:proposalFor(session.id)}));
  const unchanged=()=>{
    assertAvailable();
    const current=affectedFileSessions(actions,sessions().values());
    if(current.length!==snapshots.length||snapshots.some(snapshot=>{
      return sessions().get(snapshot.session.id)!==snapshot.session||filePath(snapshot.session)!==snapshot.path||
        (snapshot.session.view?.state||snapshot.session.state)?.doc!==snapshot.doc||(snapshot.session.contentVersion||0)!==snapshot.version||
        proposalFor(snapshot.session.id)!==snapshot.proposal;
    }))throw new Error('等待文件检查时正文或待审建议已变化，当前内容仍保留，请重新操作。');
  };
  await flush();
  unchanged();
  for(const session of affected){
    if(!session.dirty)continue;
    const saved=await saveSession(session.id,true);
    unchanged();
    if(!saved||session.dirty)throw new Error('文件未能保存或保存期间有新修改，请先处理后再整理。');
  }
  unchanged();
  if(affected.some(session=>session.dirty))throw new Error('文件未能保存或保存期间有新修改，请先处理后再整理。');
  return {affected,validate:unchanged};
}
