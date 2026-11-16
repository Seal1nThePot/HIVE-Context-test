import {describe,expect,it,vi} from 'vitest';
import {EditorState,type TransactionSpec} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';
import {mapAnchor} from '../../shared/core';
import {initialConfig} from '../settings/modelConfig';
import type {EditorSession} from '../editor/editorSessionTypes';
import {generateWriting,stopWritingGeneration,type GenerationContext} from './writingGeneration';
import {createProposalActions} from './proposalActions';

const response=()=>new Response('event: chunk\ndata: '+JSON.stringify(JSON.stringify({text:'足够清楚',reason:'局部替换'}))+'\n\nevent: done\ndata: null\n\n');
function fixture(){
  const doc='# 正文\n\n很清楚。\n\n尾声。',from=doc.indexOf('很清楚');let state=EditorState.create({doc,selection:{anchor:from,head:from+3}}),prompt='把“很清楚”改成“足够清楚”';
  const session:EditorSession={id:'editor',disk:{path:'A.md',text:doc,hash:'hash-a',eol:'LF',bom:false},state,view:null,dirty:false};
  const lifecycle:GenerationContext['lifecycle']={running:{current:false},generation:{current:0},controller:{current:null},requestAnchor:{current:null},proposal:{current:null}};
  const undo:Parameters<typeof createProposalActions>[0]['undo']={current:[]};
  const editor={get state(){return state;},dispatch(spec:TransactionSpec){const tr=state.update(spec);state=tr.state;session.state=state;if(tr.docChanged){if(lifecycle.requestAnchor.current)lifecycle.requestAnchor.current=mapAnchor(lifecycle.requestAnchor.current,tr.changes);if(lifecycle.proposal.current)lifecycle.proposal.current=mapAnchor(lifecycle.proposal.current,tr.changes);undo.current=undo.current.map(a=>mapAnchor(a,tr.changes));}},focus:vi.fn()} as unknown as EditorView;session.view=editor;
  const context:GenerationContext={
    document:{view:{current:editor},disk:{current:session.disk},sessions:{current:new Map([['editor',session]])},activeSession:{current:'editor'},file:'A.md',outline:[]},
    model:{config:{...initialConfig,demo:false,selection:{serviceId:'test',modelId:'model-a'},model:'model-a'},reasoningEffort:'default'},
    conversation:{mode:'edit',prompt,messages:[],setPrompt:next=>{prompt=typeof next==='function'?next(prompt):next;},setLastRequest:vi.fn(),add:vi.fn()},
    lifecycle,references:{sources:[]},writingOutline:{ready:true,busy:false,nodes:[]},request:vi.fn<typeof fetch>().mockResolvedValue(response()),annotationResponded:vi.fn(),
    ui:{setError:vi.fn(),setBusy:vi.fn(),setStream:vi.fn(),openPanel:vi.fn(),inform:vi.fn(),redraw:vi.fn()},
  };
  const actions=createProposalActions({view:context.document.view,disk:context.document.disk,proposal:lifecycle.proposal,undo,writingOutline:{nodes:[],save:vi.fn().mockResolvedValue(undefined)},add:context.conversation.add,setError:context.ui.setError,inform:context.ui.inform,redraw:context.ui.redraw,setMode:vi.fn(),setPrompt:context.conversation.setPrompt,openChat:vi.fn(),promptRef:{current:null}});
  return {context,editor,actions,doc,getPrompt:()=>prompt};
}
describe('writing generation and review migration',()=>{
  it('creates a proposal before changing text, then accepts and undoes it while preserving outside edits',async()=>{
    const f=fixture();await generateWriting(f.context);expect(f.editor.state.doc.toString()).toBe(f.doc);
    const proposal=f.context.lifecycle.proposal.current!;expect(proposal.from).toBeGreaterThanOrEqual(f.doc.indexOf('很清楚'));expect(proposal.to).toBeLessThanOrEqual(f.doc.indexOf('很清楚')+3);
    f.actions.accept();expect(f.editor.state.doc.toString()).toBe(f.doc.replace('很清楚','足够清楚'));
    f.editor.dispatch({changes:{from:f.editor.state.doc.length,insert:'\n手写补充。'}});f.actions.undoAI();expect(f.editor.state.doc.toString()).toBe(f.doc+'\n手写补充。');
  });
  it('refuses to accept a proposal after its target was edited by hand',async()=>{
    const f=fixture();await generateWriting(f.context);const proposal=f.context.lifecycle.proposal.current!;
    f.editor.dispatch({changes:{from:proposal.from,to:proposal.to,insert:'人工改写'}});const before=f.editor.state.doc.toString();f.actions.accept();expect(f.editor.state.doc.toString()).toBe(before);expect(f.context.ui.setError).toHaveBeenLastCalledWith(expect.stringContaining('手改'));
  });
  it('does not install a late response after switching documents or stopping',async()=>{
    const f=fixture();let resolve!:(response:Response)=>void;f.context.request=vi.fn<typeof fetch>().mockImplementation(()=>new Promise<Response>(done=>{resolve=done;}));
    const pending=generateWriting(f.context);stopWritingGeneration(f.context.lifecycle,f.context.ui);f.context.document.activeSession.current='editor:other';f.context.document.disk.current={...f.context.document.disk.current!,path:'B.md'};resolve(response());await pending;
    expect(f.context.lifecycle.proposal.current).toBeNull();expect(f.editor.state.doc.toString()).toBe(f.doc);expect(f.context.conversation.add).not.toHaveBeenCalledWith('assistant',expect.anything());
  });
  it('keeps a newer typed message when an in-flight request fails',async()=>{
    const f=fixture();let fail!:(error:Error)=>void;f.context.request=vi.fn<typeof fetch>().mockImplementation(()=>new Promise<Response>((_,reject)=>{fail=reject;}));
    const pending=generateWriting(f.context);f.context.conversation.setPrompt('下一轮的新输入');fail(new Error('网络失败'));await pending;expect(f.getPrompt()).toBe('下一轮的新输入');expect(f.context.lifecycle.running.current).toBe(false);expect(f.editor.state.doc.toString()).toBe(f.doc);
  });
});
