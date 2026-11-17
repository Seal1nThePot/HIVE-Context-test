import {afterEach,expect,it,vi} from 'vitest';
import {WorkspaceTreeSync,documentSyncBaselines,pollAfterCompletion} from './workspaceSync';
import type {EditorSession} from '../editor/editorSessionTypes';

afterEach(()=>vi.useRealTimers());
it('isolates opaque tree cursors across repository identities, including a round trip',()=>{
    const cursor=new WorkspaceTreeSync().select({id:'a',root:'first'}),first=cursor.beginSync()!;
    expect(first.treeVersion).toBeUndefined();
    expect(cursor.accept(first,'opaque:17')).toBe(true);
    expect(cursor.beginSync()?.treeVersion).toBe('opaque:17');
    expect(cursor.current(first,{id:'b',root:'first'})).toBe(false);
    cursor.select({id:'a',root:'second'});
    expect(cursor.current(first)).toBe(false);expect(cursor.beginSync()?.treeVersion).toBeUndefined();
    cursor.select({id:'a',root:'first'});
    expect(cursor.current(first)).toBe(false);expect(cursor.beginSync()?.treeVersion).toBeUndefined();
});
it('coordinates forced refreshes with polling and discards a superseded refresh',()=>{
    const cursor=new WorkspaceTreeSync(),poll=cursor.beginSync()!;
    cursor.accept(poll,'before');
    const old=cursor.beginRefresh();
    expect(cursor.beginSync()).toBeUndefined();expect(cursor.current(poll)).toBe(false);
    const refresh=cursor.beginRefresh();
    expect(cursor.finishRefresh(old,'stale')).toBe(false);
    expect(cursor.finishRefresh(refresh,'refreshed')).toBe(true);
    expect(cursor.finishRefresh(refresh)).toBe(false);
    expect(cursor.beginSync()?.treeVersion).toBe('refreshed');
});
it('deduplicates paths and only sends agreed file hashes for the unchanged shortcut',()=>{
    const session=(path:string,hash:string)=>({disk:{path,hash}} as EditorSession);
    const result=documentSyncBaselines([session('shared','a'),session('shared','b'),session('same','c'),session('same','c'),session('__proto__','safe'),{disk:null} as EditorSession]);
    expect(result.paths).toEqual(['shared','same','__proto__']);
    expect(result.baselines.get('shared')).toBe('b');
    expect(Object.entries(result.knownBaselines)).toEqual([['same','c'],['__proto__','safe']]);
});
it('waits until a poll finishes before scheduling another, and releases pending timers',async()=>{
    vi.useFakeTimers();let complete!:()=>void;
    const run=vi.fn(()=>new Promise<void>(resolve=>{complete=resolve;})),stop=pollAfterCompletion(run,2000);
    await vi.advanceTimersByTimeAsync(2000);expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10000);expect(run).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
    complete();await Promise.resolve();expect(vi.getTimerCount()).toBe(1);
    stop();expect(vi.getTimerCount()).toBe(0);
});
it('does not recreate a timer when stopped during an in-flight request',async()=>{
    vi.useFakeTimers();let complete!:()=>void;
    const stop=pollAfterCompletion(()=>new Promise<void>(resolve=>{complete=resolve;}),2000);
    await vi.advanceTimersByTimeAsync(2000);stop();complete();await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
});
