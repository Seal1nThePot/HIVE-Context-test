import {describe,it,expect} from 'vitest';
import {EditorState,type TransactionSpec} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';
import {history,undo} from '@codemirror/commands';
import {findNext,replaceAll,replaceNext,searchPanelOpen,setSearchQuery} from '@codemirror/search';
import {emptyFind,floatingSearchExtensions,makeSearchQuery,searchMatches} from './searchTools';
function target(doc:string,readOnly=false){let state=EditorState.create({doc,extensions:[history(),floatingSearchExtensions,EditorState.readOnly.of(readOnly)]});
  const view={get state(){return state;},dispatch:(...specs:TransactionSpec[])=>{state=state.update(...specs).state;},plugin:()=>null} as unknown as EditorView;return view;
}
describe('floating find and replace',()=>{
  it('matches literal, case-sensitive and whole-word queries and handles invalid regular expressions',()=>{
    const view=target('cat scatter Cat cat_1 cat.');
    expect(searchMatches(view.state,makeSearchQuery({...emptyFind,search:'cat'})).count).toBe(5);
    expect(searchMatches(view.state,makeSearchQuery({...emptyFind,search:'cat',wholeWord:true})).count).toBe(3);
    expect(searchMatches(view.state,makeSearchQuery({...emptyFind,search:'cat',wholeWord:true,caseSensitive:true})).count).toBe(2);
    expect(makeSearchQuery({...emptyFind,search:'[',regexp:true}).valid).toBe(false);
    expect(searchMatches(view.state,makeSearchQuery({...emptyFind,search:'cat'}),2)).toEqual({count:2,more:true});
  });
  it('finds and replaces without opening an inline editor panel, preserving undo',()=>{
    const view=target('cat cat');view.dispatch({effects:setSearchQuery.of(makeSearchQuery({...emptyFind,search:'cat',replace:'狗'}))});
    expect(findNext(view)).toBe(true);expect(searchPanelOpen(view.state)).toBe(false);expect(view.state.sliceDoc(view.state.selection.main.from,view.state.selection.main.to)).toBe('cat');
    replaceNext(view);expect(view.state.doc.toString()).toBe('狗 cat');expect(searchPanelOpen(view.state)).toBe(false);
    expect(undo(view)).toBe(true);expect(view.state.doc.toString()).toBe('cat cat');
  });
  it('supports regex capture replacements, replace all and read-only protection',()=>{
    const view=target('a=1 b=22');view.dispatch({effects:setSearchQuery.of(makeSearchQuery({...emptyFind,search:'([a-z]+)=(\\d+)',replace:'$2:$1',regexp:true}))});
    expect(replaceAll(view)).toBe(true);expect(view.state.doc.toString()).toBe('1:a 22:b');undo(view);expect(view.state.doc.toString()).toBe('a=1 b=22');
    const locked=target('cat',true);locked.dispatch({effects:setSearchQuery.of(makeSearchQuery({...emptyFind,search:'cat',replace:'狗'}))});expect(replaceAll(locked)).toBe(false);expect(locked.state.doc.toString()).toBe('cat');
  });
});
