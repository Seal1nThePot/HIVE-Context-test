import {EditorState,Text} from '@codemirror/state';
import {describe,expect,it} from 'vitest';
import {historyTextChanges,planHistoryText} from './historyText';

function document(text:string){return Text.of(text.split('\n'));}

describe('history changes',()=>{
  it('replays an AI change through unrelated edits at other positions',()=>{
    const start=EditorState.create({doc:'标题\n请将草稿保留到修改后。\n结尾'});
    const from=start.doc.toString().indexOf('草稿');
    const transaction=start.update({changes:{from,to:from+2,insert:'完成稿'}});
    const patches=historyTextChanges(transaction);
    const edited=document('新开的段落\n'+transaction.state.doc.toString()+'\n后续附记');
    const undo=planHistoryText(edited,patches,true);
    expect(undo.conflicts).toEqual([]);
    const restored=EditorState.create({doc:edited}).update({changes:undo.changes}).state.doc;
    expect(restored.toString()).toBe('新开的段落\n'+start.doc.toString()+'\n后续附记');
    const redo=planHistoryText(restored,patches,false);
    expect(redo.conflicts).toEqual([]);
    expect(EditorState.create({doc:restored}).update({changes:redo.changes}).state.doc.toString()).toBe(edited.toString());
  });

  it('requires a diff review when the changed text itself has been edited',()=>{
    const start=EditorState.create({doc:'前导：旧稿。结尾'});
    const applied=start.update({changes:{from:3,to:5,insert:'新稿'}});
    const current=document('前导：人工重写的段落。结尾');
    const plan=planHistoryText(current,historyTextChanges(applied),true);
    expect(plan.conflicts).toEqual([{title:'正文位置 4',before:'人工重写的段落',after:'旧稿'}]);
    expect(current.toString()).toBe('前导：人工重写的段落。结尾');
    expect(EditorState.create({doc:current}).update({changes:plan.changes}).state.doc.toString()).toBe(start.doc.toString());
  });
});
