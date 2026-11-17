import {describe,it,expect,vi} from 'vitest';
import {EditorState} from '@codemirror/state';
import type {EditorSession} from '../editor/editorSessionTypes';
import {affectedFileSessions,checkFileOperations,fileActionContainsPath} from './fileOperationChecks';

function session(id:string,path:string):EditorSession{
  return {id,disk:{path,text:'text',hash:'base',eol:'LF',bom:false},state:EditorState.create({doc:'text'}),view:null,dirty:false};
}
describe('shared file operation preflight',()=>{
  it('covers a folder once across overlapping actions without matching prefix siblings',()=>{
    const child=session('child','notes/child.md'),sibling=session('sibling','notes-other.md');
    const actions=[{action:'trash',path:'notes'},{action:'trash',path:'notes/child.md'}];
    expect(fileActionContainsPath(actions[0],sibling.disk!.path)).toBe(false);
    expect(affectedFileSessions(actions,[child,sibling])).toEqual([child]);
  });
  it('checks the complete set for pending proposals before flushing or saving any item',async()=>{
    const first=session('first','one.md'),second=session('second','two.md');first.dirty=true;
    const items=new Map([[first.id,first],[second.id,second]]),flush=vi.fn(),saveSession=vi.fn();
    await expect(checkFileOperations({actions:[{action:'trash',path:'one.md'},{action:'trash',path:'two.md'}],sessions:()=>items,
      context:id=>({proposal:id==='second'?{}:null,prompt:''}),assertAvailable:()=>{},flush,saveSession})).rejects.toThrow('待审建议');
    expect(flush).not.toHaveBeenCalled();expect(saveSession).not.toHaveBeenCalled();
  });
  it('stops the complete set when a later save fails and leaves every document intact',async()=>{
    const first=session('first','one.md'),second=session('second','two.md');first.dirty=second.dirty=true;
    const items=new Map([[first.id,first],[second.id,second]]),states=[first.state,second.state];
    const saveSession=vi.fn(async(id:string)=>{if(id==='first'){first.dirty=false;return true;}return false;});
    await expect(checkFileOperations({actions:[{action:'move',path:'one.md'},{action:'move',path:'two.md'}],sessions:()=>items,
      context:()=>({proposal:null,prompt:''}),assertAvailable:()=>{},flush:async()=>{},saveSession})).rejects.toThrow('未能保存');
    expect(saveSession.mock.calls.map(([id])=>id)).toEqual(['first','second']);
    expect([first.state,second.state]).toEqual(states);expect(second.dirty).toBe(true);
  });
});
