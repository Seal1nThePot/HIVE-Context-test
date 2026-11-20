import {useEffect,useRef} from 'react';
import {Transaction,type ChangeSet,type Text} from '@codemirror/state';
import {undoDepth} from '@codemirror/commands';
import {historyTextGroup} from './historyText';
import type {HistoryRecord,HistoryStatus} from './historyTypes';

type Group={id:string;file:string;start:Text;changes:ChangeSet;depth:number;label:string;createdAt:string;timer:number};
type GroupStacks={undo:string[];redo:string[];file:string};
type Options={
  append:(record:HistoryRecord)=>Promise<unknown>;
  setStatus:(id:string,status:HistoryStatus,expectedStatus:HistoryStatus,ignoreMissing?:boolean)=>Promise<unknown>;
};

export function useHumanHistory(options:Options){
  const channel=useRef(options);channel.current=options;
  const pending=useRef(new Map<string,Group>());
  const stacks=useRef(new Map<string,GroupStacks>());
  function flush(session:string){
    const group=pending.current.get(session);
    if(!group)return;
    window.clearTimeout(group.timer);
    pending.current.delete(session);
    const text=historyTextGroup(group.start,group.changes);
    if(!text.length)return;
    void channel.current.append({id:group.id,actor:'human',kind:group.label==='修改笔记属性'?'properties':'text',file:group.file,
      label:group.label,createdAt:group.createdAt,status:'applied',changes:{text}}).catch(()=>{});
  }
  function flushAll(){for(const session of pending.current.keys())flush(session);}
  useEffect(()=>()=>flushAll(),[]);
  function track(session:string,file:string,transaction:Transaction){
    if(!transaction.docChanged)return;
    let stack=stacks.current.get(session);
    if(stack?.file!==file){flush(session);stack={undo:[],redo:[],file};stacks.current.set(session,stack);}
    const undo=transaction.isUserEvent('undo'),redo=transaction.isUserEvent('redo');
    if(undo||redo){
      flush(session);
      const id=(undo?stack.undo:stack.redo).pop();
      if(!id)return;
      (undo?stack.redo:stack.undo).push(id);
      void channel.current.setStatus(id,undo?'reverted':'applied',undo?'applied':'reverted',true).catch(()=>{});
      return;
    }
    if(transaction.annotation(Transaction.addToHistory)===false||transaction.isUserEvent('input.ai')||
       transaction.isUserEvent('input.history')||transaction.isUserEvent('input.shared-document')||transaction.isUserEvent('input.disk-sync'))return;
    const depth=undoDepth(transaction.state),previous=undoDepth(transaction.startState);
    if(!depth)return;
    const current=pending.current.get(session);
    if(current&&depth===previous&&current.depth===depth){
      window.clearTimeout(current.timer);
      current.changes=current.changes.compose(transaction.changes);
      current.timer=window.setTimeout(()=>flush(session),700);
      return;
    }
    flush(session);
    const id=crypto.randomUUID();
    stack.redo=[];
    // Before the hook was mounted CodeMirror may already have groups. Match only groups the journal observed.
    if(depth===previous)stack.undo.pop();
    stack.undo.push(id);
    if(stack.undo.length>depth)stack.undo.splice(0,stack.undo.length-depth);
    const label=transaction.isUserEvent('input.properties')?'修改笔记属性':'编辑正文';
    pending.current.set(session,{id,file,start:transaction.startState.doc,changes:transaction.changes,depth,label,
      createdAt:new Date().toISOString(),timer:window.setTimeout(()=>flush(session),700)});
  }
  return {track,flushAll,
    forget:(session:string)=>{flush(session);stacks.current.delete(session);},
    group:(session:string,undo:boolean)=>stacks.current.get(session)?.[undo?'undo':'redo'].at(-1),
  };
}
