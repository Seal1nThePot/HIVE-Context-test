import {describe,it,expect} from 'vitest';
import {NativeHostRegistry} from './nativeHostRegistry';
import {EditorState} from '@codemirror/state';
import {history,undoDepth} from '@codemirror/commands';
describe('native host identities and tab transfer',()=>{
  it.each(['editor:a','editor:b'])('extracts %s without closing or renaming the source host',member=>{
    const registry=new NativeHostRegistry<object>(),sourceWindow={};
    registry.create('native-group:source',['editor:a','editor:b'],'editor:a',sourceWindow,true);
    const transfer=registry.extract(member)!;registry.create(member,[member],member,{});
    const remaining=member==='editor:a'?'editor:b':'editor:a';
    expect(registry.get(remaining)?.id).toBe('native-group:source');expect(registry.get(remaining)?.resource).toBe(sourceWindow);
    expect(registry.get(member)?.id).toBe(member);expect(registry.get(member)?.members).toEqual([member]);expect(transfer.host.members).toEqual([remaining]);
    registry.remove(member);expect(registry.get(remaining)?.id).toBe('native-group:source');expect(registry.get(member)).toBeUndefined();
  });
  it('restores original order and active tab on cancellation, including the first former owner',()=>{
    const registry=new NativeHostRegistry<object>();registry.create('native-group:g',['a','b','c'],'a',{},true);
    const transfer=registry.extract('a')!;registry.create('a',['a'],'a',{});expect(transfer.restore()).toBe(false);
    registry.remove('a');expect(transfer.restore()).toBe(true);
    expect(registry.get('c')).toMatchObject({id:'native-group:g',members:['a','b','c'],active:'a'});expect(registry.owner('a')).toBe('native-group:g');
  });
  it('keeps the neighbour active when extracting the active middle tab',()=>{
    const registry=new NativeHostRegistry<object>();registry.create('native-group:g',['a','b','c'],'b',{},true);registry.extract('b');
    expect(registry.get('a')?.active).toBe('c');expect(registry.get('a')?.members).toEqual(['a','c']);
  });
  it('does not restore into a source host that closed during the connection',()=>{
    const registry=new NativeHostRegistry<object>();registry.create('native-group:g',['a','b'],'a',{},true);
    const transfer=registry.extract('a')!;registry.remove('native-group:g');
    expect(transfer.restore()).toBe(false);expect(registry.get('a')).toBeUndefined();expect(registry.get('b')).toBeUndefined();
  });
  it('restores relative order and a valid active tab when another source member disappeared',()=>{
    const registry=new NativeHostRegistry<object>();registry.create('native-group:g',['a','b','c'],'a',{},true);
    const transfer=registry.extract('b')!;registry.removeMember('a');expect(transfer.restore()).toBe(true);
    expect(registry.get('b')).toMatchObject({members:['b','c'],active:'c'});
  });
  it('clears all aliases on host return and leaves separately extracted tabs independent',()=>{
    const registry=new NativeHostRegistry<object>();registry.create('native-group:g',['a','b','c'],'a',{},true);
    registry.extract('a');registry.create('a',['a'],'a',{});registry.remove('b');
    expect(registry.owner('b')).toBe('b');expect(registry.owner('c')).toBe('c');expect(registry.get('a')?.members).toEqual(['a']);expect(registry.values()).toHaveLength(1);
  });
  it('rejects duplicate host or member ownership instead of silently overwriting it',()=>{
    const registry=new NativeHostRegistry<object>();registry.create('native-group:g',['a','b'],'a',{},true);
    expect(()=>registry.create('a',['a'],'a',{})).toThrow();expect(()=>registry.create('native-group:g',['c'],'c',{})).toThrow();
    expect(()=>registry.create('x',['c','c'],'c',{})).toThrow();
  });
  it('transfers host ownership while preserving externally owned dirty state and undo objects',()=>{
    const edited=EditorState.create({doc:'original',extensions:[history()]}).update({changes:{from:8,insert:' unsaved'}}).state;
    const panel={state:edited},registry=new NativeHostRegistry<{panels:Map<string,typeof panel>}>();
    registry.create('native-group:g',['editor:a','editor:b'],'editor:a',{panels:new Map([['editor:a',panel]])},true);
    registry.extract('editor:a');registry.create('editor:a',['editor:a'],'editor:a',{panels:new Map([['editor:a',panel]])});
    const current=registry.get('editor:a')!.resource.panels.get('editor:a')!;
    expect(current).toBe(panel);expect(current.state).toBe(edited);expect(current.state.doc.toString()).toBe('original unsaved');expect(undoDepth(current.state)).toBe(1);
  });
});
