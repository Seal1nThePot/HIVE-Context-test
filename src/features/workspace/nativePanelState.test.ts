import {describe,it,expect} from 'vitest';
import {NativeDragHandoff,minimizeNativePanel,openNativePanel,canDetachDocumentTab,returnNativeGroup} from './nativePanelState';
import {defaultWorkspace,isolateWorkspacePanel,placeWorkspacePanel,floatWorkspaceGroup,findPanelGroup} from './workspaceState';
import {dockedPanels} from './panelLayout';
const rect={x:100,y:160,width:420,height:300};
describe('native window handoff and shelf lifecycle',()=>{
  it('keeps desktop movement unconstrained while the native document connects',()=>{
    const drag=new NativeDragHandoff(rect,{x:160,y:175});drag.move({x:-1400,y:900});
    expect(drag.placement()).toEqual({...rect,x:-1460,y:885});expect(drag.ready()).toBe(true);expect(drag.phase).toBe('dragging');
  });
  it('retains a release before connection without restarting a drag',()=>{
    const drag=new NativeDragHandoff(rect,{x:160,y:175});drag.move({x:2200,y:190});drag.end();
    expect(drag.ready()).toBe(false);expect(drag.phase).toBe('ended');expect(drag.placement().x).toBe(2140);
  });
  it('never revives a cancelled connection and ignores later movement',()=>{
    const drag=new NativeDragHandoff(rect,{x:160,y:175});drag.cancel();drag.move({x:4000,y:2000});
    expect(drag.ready()).toBe(false);expect(drag.placement()).toEqual(rect);expect(drag.phase).toBe('cancelled');
  });
  it('reopens native shelf entries independently without collapsing a different native window',()=>{
    let layout=defaultWorkspace();layout=minimizeNativePanel(layout,'files',rect,{edge:'left',offset:.75,rect});
    layout=minimizeNativePanel(layout,'conversation',rect,{edge:'right',offset:.25,rect});
    layout=openNativePanel(layout,'files');layout=openNativePanel(layout,'conversation');
    expect(layout.open).toEqual(expect.arrayContaining(['files','conversation']));expect(layout.autoHideActive??null).toBeNull();
    expect(layout.autoHide?.files.edge).toBe('left');expect(layout.autoHide?.files.offset).toBe(.75);
    const moved={...rect,x:1800,width:600};layout=minimizeNativePanel(layout,'files',moved,layout.autoHide!.files);
    expect(layout.autoHide?.files).toEqual({edge:'left',offset:.75,rect:moved});expect(layout.open).toContain('conversation');
    expect(layout.minimized).toContain('files');expect(layout.autoHideActive??null).toBeNull();
  });
  it('an explicit new rail drop replaces previous native shelf placement',()=>{
    let layout=minimizeNativePanel(defaultWorkspace(),'conversation',rect,{edge:'right',offset:.25,rect});
    layout=openNativePanel(layout,'conversation');layout=minimizeNativePanel(layout,'conversation',rect,{edge:'left',offset:.75,rect});
    expect(layout.autoHide?.conversation).toEqual({edge:'left',offset:.75,rect});
  });
  it('permits the explicit primary tab gesture with two visible documents and keeps its siblings',()=>{
    let layout=defaultWorkspace();expect(canDetachDocumentTab(layout,'editor')).toBe(false);
    layout=placeWorkspacePanel(layout,'editor:second','editor','center',rect);
    expect(canDetachDocumentTab(layout,'editor')).toBe(true);const source=structuredClone(layout);const next=isolateWorkspacePanel(layout,'editor');
    expect(dockedPanels(next.tree)).toEqual(expect.arrayContaining(['editor','editor:second']));expect(layout).toEqual(source);
    expect(canDetachDocumentTab({...layout,open:layout.open.filter(id=>id!=='editor:second')},'editor')).toBe(false);
    expect(canDetachDocumentTab(layout,'conversation')).toBe(false);
  });
  it('returns a floating native group without splitting its members or losing the active tab',()=>{
    const group={type:'group' as const,id:'native-tools',panels:['outline','scratch'],active:'scratch'};
    const base=defaultWorkspace();base.open.push(...group.panels);
    const floating=floatWorkspaceGroup(base,group,rect),returned=returnNativeGroup(floating,group,rect);
    expect(findPanelGroup(returned.tree,'outline')).toMatchObject({panels:group.panels,active:'scratch'});
    expect(returned.floatingGroups).toEqual([]);expect(returned.open).toEqual(expect.arrayContaining(group.panels));
  });
  it('keeps an existing docked group home intact when its native host closes',()=>{
    const base=placeWorkspacePanel(defaultWorkspace(),'outline','files','center',rect),group=findPanelGroup(base.tree,'outline')!;
    const tree=structuredClone(base.tree),returned=returnNativeGroup(base,group,rect);
    expect(returned.tree).toEqual(tree);
  });
});
