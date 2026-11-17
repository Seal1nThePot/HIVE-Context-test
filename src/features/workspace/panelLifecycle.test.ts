import {describe,it,expect,vi} from 'vitest';
import {PanelLifecycle} from './panelLifecycle';

const rect={x:0,y:0,width:300,height:400};
describe('panel operation ownership',()=>{
  it('does not reserve presentation from historical recovery information',()=>{
    const lifecycle=new PanelLifecycle();lifecycle.homes.set('files',{rect});
    expect(lifecycle.opening('files')).toBe(false);
    lifecycle.queue('files');expect(lifecycle.opening('files')).toBe(true);
  });
  it('rejects late completion after close and a newer open',()=>{
    const lifecycle=new PanelLifecycle();lifecycle.queue('files');const old=lifecycle.pendingOpen.get('files')!;
    lifecycle.clear(['files']);lifecycle.queue('files');const current=lifecycle.pendingOpen.get('files')!;
    expect(current.id).toBeGreaterThan(old.id);expect(old.result).toBe('cancelled');
    expect(lifecycle.finish(old,'failed')).toBe(false);expect(lifecycle.pendingOpen.get('files')).toBe(current);
    expect(lifecycle.finish(current,'succeeded')).toBe(true);expect(lifecycle.opening('files')).toBe(false);
  });
  it('lets a connecting group finish its remaining members after one is removed',()=>{
    const lifecycle=new PanelLifecycle(),group={type:'group' as const,id:'tools',panels:['a','b','c'],active:'a'};
    lifecycle.groups.set(group.id,group);lifecycle.queueGroup(group);const operation=lifecycle.pendingGroups.get(group.id)!;
    lifecycle.pendingGroups.delete(group.id);lifecycle.clear(['a']);
    expect(lifecycle.members(operation)).toEqual(['b','c']);expect(lifecycle.groups.get('tools')?.panels).toEqual(['b','c']);
    expect(lifecycle.finish(operation,'failed')).toBe(true);expect(lifecycle.opening('b')).toBe(false);
  });
  it('does not clear a newer member request when an older group completes',()=>{
    const lifecycle=new PanelLifecycle();const group=lifecycle.begin('open',['a','b']);
    const next=lifecycle.begin('open',['a']);lifecycle.finish(group,'succeeded');
    expect(lifecycle.isCurrent(next)).toBe(true);expect(lifecycle.members(group)).toEqual([]);
  });
  it('turns the sole remaining queued group member into a single request',()=>{
    const lifecycle=new PanelLifecycle(),group={type:'group' as const,id:'tools',panels:['a','b'],active:'a'};
    lifecycle.groups.set(group.id,group);lifecycle.queueGroup(group);lifecycle.clear(['a']);
    expect(lifecycle.groups.size).toBe(0);expect(lifecycle.pendingGroups.size).toBe(0);expect(lifecycle.pendingOpen.has('b')).toBe(true);
  });
  it.each(['rejected','failed'] as const)('does not commit or cancel pending work when a transition is %s',result=>{
    const lifecycle=new PanelLifecycle(),commit=vi.fn();lifecycle.queue('a');const operation=lifecycle.pendingOpen.get('a');
    expect(lifecycle.transition('dock',['a'],()=>result!=='rejected',()=>result!=='failed',commit)).toBe(result);
    expect(commit).not.toHaveBeenCalled();expect(lifecycle.pendingOpen.get('a')).toBe(operation);
  });
  it('clears every request and recovery record when replacing a view',()=>{
    const lifecycle=new PanelLifecycle();lifecycle.homes.set('a',{rect});lifecycle.queue('a');lifecycle.handoffs.add('a');
    const operation=lifecycle.pendingOpen.get('a')!;lifecycle.reset();
    expect(lifecycle.isCurrent(operation)).toBe(false);expect(lifecycle.pendingOpen.size).toBe(0);expect(lifecycle.handoffs.size).toBe(0);expect(lifecycle.homes.size).toBe(0);
  });
});
