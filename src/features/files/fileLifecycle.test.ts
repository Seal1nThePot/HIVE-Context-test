import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
import {EditorView} from '@codemirror/view';
import {undoDepth,undo} from '@codemirror/commands';
import type {Transaction} from '@codemirror/state';
import {useFileActions} from './useFileActions';
import {useDocumentPersistence} from './useDocumentPersistence';
import {makeState} from '../editor/Editor';
import {applyStoredDocumentChange} from '../editor/storedDocumentChanges';
import type {EditorSession} from '../editor/editorSessionTypes';
import type {DiskFile} from '../../shared/fileTypes';

function deferred<T=any>(){let resolve!:(value:T)=>void,reject!:(reason:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const data=(path:string,text='original',hash='hash-'+path):DiskFile=>({path,text,hash,eol:'LF',bom:false});
async function tick(){await Promise.resolve();await Promise.resolve();}
function setup(){
  const callbacks=new Map<string,ReturnType<typeof vi.fn>>(),open=new Set(['editor']),busy:boolean[]=[],errors:string[]=[];
  let file='',confirm:any,dialog:any=null;
  const noop=()=>{};
  const opts:any={sessions:{current:new Map<string,EditorSession>([['editor',{id:'editor',disk:null,state:null,view:null,dirty:false}]])},activeSession:{current:'editor'},activeTextSource:{current:'document'},editorState:{current:null},view:{current:null},disk:{current:null},proposal:{current:null},undo:{current:[]},appAlive:{current:true},promptRef:{current:{value:''}},dialogRef:{current:null},prompt:'',dialog:null,file:'',dirty:false,
    running:{current:false},structuring:{current:false},switching:{current:false},viewApplying:{current:false},creatingNote:{current:false},savingPaths:{current:new Set()},fileWorkspace:{info:{id:'space',root:'synthetic'},flush:async()=>{},update:async()=>{}},annotations:{syncEditor:noop},references:{remap:noop},uid:(()=>{let value=0;return()=>String(++value);})(),stop:noop,redraw:noop,inform:noop,
    setFile:(value:string)=>{file=value;},setFileBusy:(value:boolean)=>busy.push(value),setError:(value:string)=>errors.push(value),setConfirm:(value:any)=>{confirm=value;},setDialog:(value:any)=>{dialog=value;opts.dialogRef.current=value;},bindings:(id:string)=>{if(!callbacks.has(id))callbacks.set(id,vi.fn());return {onUpdate:callbacks.get(id)!};}};
  for(const name of ['setDirty','setNewNoteBusy','setEntries','setRoot','setFilter','setRenameRequest','setCollapsed','setTrashRevision','setInlineRequest','setOutline','setSelection','setMessages','setLastRequest','setPrompt','setStream','setWritingNodeId'])opts[name]=noop;
  const activate=(id:string)=>{opts.activeSession.current=id;const session=opts.sessions.current.get(id);opts.disk.current=session?.disk;opts.editorState.current=session?.state;opts.view.current=session?.view;file=session?.disk?.path||'';};
  opts.workspace={isOpen:(id:string)=>open.has(id),open:(id:string)=>{open.add(id);activate(id);},openDocumentTab:(id:string)=>{open.add(id);activate(id);},close:(id:string)=>open.delete(id),openIds:['editor']};
  let handler:(url:string,body?:unknown)=>Promise<any>=async(url)=>url==='/tree'?{root:'synthetic',entries:[]}:data(decodeURIComponent(url.split('=')[1]||'unknown'));
  opts.api=vi.fn((url:string,body?:unknown)=>handler(url,body));
  let persistence!:ReturnType<typeof useDocumentPersistence>;
  function Persistence(){persistence=useDocumentPersistence({...opts,fileBusy:false,tick:0,autoSave:false,onStoredChange:(id,transaction)=>opts.onStoredChange?.(id,transaction)});return null;}
  renderToStaticMarkup(React.createElement(Persistence));opts.saveSession=persistence.saveSession;opts.applyDiskFile=persistence.applyDiskFile;opts.savingPaths=persistence.savingPaths;
  const actions=()=>useFileActions(opts);
  function add(id:string,path:string,text='original'){
    const state=makeState(text,opts.bindings(id).onUpdate),session:EditorSession={id,disk:data(path,text),state,view:null,dirty:false};opts.sessions.current.set(id,session);open.add(id);return session;
  }
  function edit(session:EditorSession,text=' UNSAVED'){session.state=session.state!.update({changes:{from:session.state!.doc.length,insert:text},userEvent:'input.type'}).state;session.dirty=true;session.contentVersion=(session.contentVersion||0)+1;}
  return {opts,actions,add,edit,activate,open,busy,errors,persistence,callbacks,setHandler:(value:typeof handler)=>{handler=value;},file:()=>file,confirm:()=>confirm,setDialog:(value:any)=>{dialog=value;opts.dialog=value;opts.dialogRef.current=value;},dialog:()=>dialog};
}

describe('file read authority and local history',()=>{
  it('keeps the newest open and its loading lease when an older response or error arrives',async()=>{
    const t=setup(),a=deferred(),b=deferred();t.setHandler(url=>url.includes('A.md')?a.promise:b.promise);
    const first=t.actions().openFile('A.md'),second=t.actions().openFile('B.md');a.reject(new Error('old failure'));await first;
    expect(t.busy.at(-1)).toBe(true);expect(t.errors).not.toContain('old failure');b.resolve(data('B.md'));await second;
    expect(t.file()).toBe('B.md');expect(t.busy.at(-1)).toBe(false);
  });
  it('rejects a late response after editing, closing/reopening, or unmounting the workspace',async()=>{
    for(const change of ['edit','close','unmount']){
      const t=setup(),session=t.add('editor','old.md'),read=deferred();t.setHandler(()=>read.promise);const pending=t.actions().openFile('A.md');
      if(change==='edit')t.edit(session);else if(change==='close'){t.open.delete('editor');session.contentVersion=1;t.open.add('editor');}else t.opts.appAlive.current=false;
      const prior=session.state;read.resolve(data('A.md'));await pending;expect(session.state).toBe(prior);expect(session.disk?.path).toBe('old.md');
    }
  });
  it('fixes the target before flush, permits selection/sleep changes, and does not steal another editor',async()=>{
    const t=setup(),first=t.add('editor','old.md'),other=t.add('other','other.md'),flush=deferred(),read=deferred();t.opts.fileWorkspace.flush=()=>flush.promise;t.setHandler(()=>read.promise);
    const pending=t.actions().openExplorerFile('A.md');t.activate('other');first.state=first.state!.update({selection:{anchor:2}}).state;flush.resolve(undefined);await tick();read.resolve(data('A.md'));await pending;
    expect(first.disk?.path).toBe('A.md');expect(other.disk?.path).toBe('other.md');expect(t.opts.activeSession.current).toBe('other');expect(t.file()).toBe('other.md');
  });
  it('does not issue the read when text changes during a flush or save',async()=>{
    const t=setup(),session=t.add('editor','old.md'),flush=deferred();t.opts.fileWorkspace.flush=()=>flush.promise;
    const pending=t.actions().openExplorerFile('A.md');t.edit(session);flush.resolve(undefined);await pending;expect(t.opts.api).not.toHaveBeenCalled();expect(session.dirty).toBe(true);
  });
  it('guards a landing read whose target is filled while waiting',async()=>{
    const t=setup(),session=t.opts.sessions.current.get('editor')!;session.landing=true;const read=deferred();t.setHandler(()=>read.promise);
    const pending=t.actions().openInLanding('A.md','editor');await tick();session.landing=false;session.state=makeState('NEW LOCAL',()=>{});read.resolve(data('A.md'));await pending;
    expect(session.state.doc.toString()).toBe('NEW LOCAL');expect(session.disk).toBeNull();
  });
  it('reopening the same saved or dirty path retains state, history, selection and pending context',()=>{
    const t=setup(),session=t.add('editor','same.md');t.edit(session);session.state=session.state!.update({selection:{anchor:3}}).state;
    const state=session.state,proposal={id:'pending'};t.opts.proposal.current=proposal;t.actions().showFile(data('same.md'));
    expect(session.state).toBe(state);expect(session.dirty).toBe(true);expect(undoDepth(session.state!)).toBeGreaterThan(0);expect(t.opts.proposal.current).toBe(proposal);
    session.disk={...session.disk!,text:session.state!.doc.toString(),hash:'saved'};session.dirty=false;t.actions().showFile(session.disk);
    expect(session.state).toBe(state);expect(session.state!.selection.main.head).toBe(3);expect(undoDepth(session.state!)).toBeGreaterThan(0);
  });
  it('adopts a real clean disk change by transaction but preserves conflicting local text and its final error',async()=>{
    const t=setup(),session=t.add('editor','same.md');t.actions().showFile(data('same.md','remote','new-hash'));
    expect(session.state!.doc.toString()).toBe('remote');expect(undoDepth(session.state!)).toBeGreaterThan(0);
    t.edit(session);const prior=session.state,count=t.opts.sessions.current.size;
    t.setHandler(async()=>data('same.md','different remote','external'));await t.actions().openExplorerFile('same.md',true);
    expect(session.state).toBe(prior);expect(t.opts.sessions.current.size).toBe(count);expect(t.errors.at(-1)).toContain('磁盘和本地都有修改');
  });
  it('shares Text in a new view while keeping independent history and the new callback',async()=>{
    const t=setup(),source=t.add('editor','same.md');t.edit(source);const doc=source.state!.doc,read=vi.spyOn(doc,'toString');
    t.setHandler(async()=>source.disk);await t.actions().openExplorerFile('same.md',true);
    const created=[...t.opts.sessions.current.values()].find((session:any)=>session.id!=='editor') as EditorSession;
    expect(created.state!.doc).toBe(doc);expect(created.dirty).toBe(true);expect(undoDepth(created.state!)).toBe(0);expect(undoDepth(source.state!)).toBeGreaterThan(0);
    expect(created.state!.facet(EditorView.updateListener)).toContain(t.callbacks.get(created.id));expect(created.state!.facet(EditorView.updateListener)).not.toContain(t.callbacks.get(source.id));expect(read).not.toHaveBeenCalled();
  });
  it('protects every same-path view during explicit reload, not only the invoking view',async()=>{
    const t=setup(),first=t.add('editor','same.md'),other=t.add('other','same.md'),read=deferred();t.setHandler(()=>read.promise);
    t.actions().reloadFromDisk('editor');t.confirm().action();t.edit(other);read.resolve(data('same.md','disk','new'));await tick();await tick();
    expect(first.state!.doc.toString()).toBe('original');expect(other.state!.doc.toString()).toBe('original UNSAVED');expect(t.errors.at(-1)).toContain('所有本地内容仍保留');
  });
  it('saves an asleep target as a copy without flattening/replacing another active target or its history',async()=>{
    const t=setup(),first=t.add('editor','same.md'),other=t.add('other','other.md');t.edit(first);const state=first.state,write=deferred();t.setDialog({kind:'saveAs',value:'copy.md',title:'copy'});
    t.setHandler(async(url,body:any)=>{if(url==='/file'){expect(body.text).toBe('original UNSAVED');return write.promise;}if(url.startsWith('/file?'))return data('copy.md','original UNSAVED','copy-hash');return {root:'synthetic',entries:[]};});
    const pending=t.actions().submitDialog({preventDefault(){}} as any);t.activate('other');write.resolve({hash:'copy-hash'});await pending;
    expect(first.disk?.path).toBe('copy.md');expect(first.state).toBe(state);expect(undoDepth(first.state!)).toBeGreaterThan(0);expect(other.disk?.path).toBe('other.md');expect(t.file()).toBe('other.md');
  });
  it('retains later edits when a save-as write completes and does not read back over them',async()=>{
    const t=setup(),session=t.add('editor','same.md'),write=deferred();t.setDialog({kind:'saveAs',value:'copy.md',title:'copy'});t.setHandler(()=>write.promise);
    const pending=t.actions().submitDialog({preventDefault(){}} as any);t.edit(session);write.resolve({hash:'copy-hash'});await pending;
    expect(session.disk?.path).toBe('same.md');expect(session.state!.doc.toString()).toBe('original UNSAVED');expect(t.opts.api).toHaveBeenCalledTimes(1);
  });
  it('captures an import target before File.text resolves and keeps the newly active editor intact',async()=>{
    const t=setup(),first=t.add('editor','old.md'),other=t.add('other','other.md'),fileText=deferred<string>();
    t.setHandler(async(url)=>url==='/file'?{hash:'imported'}:url.startsWith('/file?')?data('import.md','IMPORTED','imported'):{root:'synthetic',entries:[]});
    const pending=t.actions().importFile({name:'import.md',size:8,text:()=>fileText.promise} as File);t.activate('other');fileText.resolve('IMPORTED');await pending;
    expect(first.disk?.path).toBe('import.md');expect(first.state!.doc.toString()).toBe('IMPORTED');expect(other.disk?.path).toBe('other.md');expect(t.file()).toBe('other.md');
  });
  it('does not let an old save clear the loading indicator of a pending open',async()=>{
    const t=setup(),session=t.add('editor','old.md'),write=deferred(),read=deferred();t.edit(session);
    t.setHandler(url=>url==='/file'?write.promise:read.promise);const saving=t.persistence.saveSession('editor'),opening=t.actions().openFile('next.md');
    write.resolve({hash:'saved'});await saving;expect(t.busy.at(-1)).toBe(true);read.resolve(data('next.md'));await opening;expect(t.busy.at(-1)).toBe(false);
  });
  it('maps inactive pending AI anchors through disk changes instead of discarding them',()=>{
    const t=setup(),session=t.add('editor','same.md','one target three');session.context={proposal:{id:'proposal',from:4,to:10,original:'target',file:'same.md',stale:false,text:'new',reason:'reason',mode:'edit',count:3,node:'node'},undo:[],messages:[],prompt:'',writingNodeId:null,lastRequest:null};
    t.persistence.applyDiskFile(data('same.md','one changed three','new'));
    expect(session.context.proposal?.id).toBe('proposal');expect(session.context.proposal?.stale).toBe(true);expect(session.state!.doc.toString()).toBe('one changed three');
  });
});

describe('stored persistence notifications',()=>{
  it('notifies the App owner with the actual no-View transaction and never revives an overlapped pending result',()=>{
    const t=setup(),session=t.add('editor','same.md','one target three');
    const anchor={from:4,to:10,original:'target',file:'same.md',stale:false};
    const owners:any={editorState:{current:session.state},proposal:{current:{...anchor,id:'pending',text:'next',reason:'reason',mode:'edit',count:4,node:'node'}},requestAnchor:{current:{...anchor}},undo:{current:[]}};
    t.opts.onStoredChange=vi.fn((id:string,transaction:Transaction)=>{expect(id).toBe('editor');expect(session.view).toBeNull();expect(session.state).toBe(transaction.state);applyStoredDocumentChange(owners,transaction);});
    t.persistence.applyDiskFile(data('same.md','one changed three','new'));
    t.persistence.applyDiskFile(data('same.md','one target three','restored'));
    expect(t.opts.onStoredChange).toHaveBeenCalledTimes(2);expect(owners.editorState.current).toBe(session.state);expect(owners.proposal.current.stale).toBe(true);expect(owners.requestAnchor.current.stale).toBe(true);
  });
});

describe('save snapshot authority',()=>{
  it('serializes once, keeps later edits dirty and never overwrites a rebound save baseline',async()=>{
    const t=setup(),one=t.add('editor','same.md'),two=t.add('other','same.md');t.edit(one);two.state=one.state;
    const snapshot=one.state!.doc,read=vi.spyOn(snapshot,'toString'),pending=deferred();t.setHandler(()=>pending.promise);
    const saving=t.persistence.saveSession('editor');t.edit(one,' later');two.disk={...two.disk!,text:'fresh reload',hash:'fresh'};pending.resolve({hash:'saved'});await saving;
    expect(read).toHaveBeenCalledOnce();expect(one.disk?.text).toBe('original UNSAVED');expect(one.dirty).toBe(true);expect(two.disk?.hash).toBe('fresh');expect(two.disk?.text).toBe('fresh reload');
  });
  it('keeps unchanged views clean and preserves undo history after a successful save',async()=>{
    const t=setup(),session=t.add('editor','same.md');t.edit(session);const state=session.state!;t.setHandler(async()=>({hash:'saved'}));await t.persistence.saveSession('editor');
    expect(session.state).toBe(state);expect(session.dirty).toBe(false);let restored=state;const dispatch=(tr:Transaction)=>{restored=tr.state;};expect(undo({state:restored,dispatch})).toBe(true);expect(restored.doc.toString()).toBe('original');
  });
  it('does not apply a completed save to an unmounted workspace owner',async()=>{
    const t=setup(),session=t.add('editor','same.md'),pending=deferred();t.edit(session);const baseline=session.disk;t.setHandler(()=>pending.promise);
    const saving=t.persistence.saveSession('editor');t.opts.appAlive.current=false;pending.resolve({hash:'saved'});expect(await saving).toBe(true);expect(session.disk).toBe(baseline);expect(session.dirty).toBe(true);
  });
});
