import {describe,expect,it} from 'vitest';
import {dockedPanels,measureDockTree,resizeDockSplit} from './panelLayout';
import {floatWorkspaceGroup,placeWorkspaceGroup,activateWorkspacePanel,defaultWorkspace,detachWorkspacePanel,findPanelGroup,hideWorkspacePanel,openWorkspacePanel,placeWorkspacePanel,isolateWorkspacePanel} from './workspaceState';
const rect={x:100,y:200,width:500,height:400};
describe('workspace tabs and minimize',()=>{
  it('separates one native-window home from a docked group without duplicating panel identities',()=>{
    const original=placeWorkspacePanel(defaultWorkspace(),'editor:second','editor','center',rect);
    const next=isolateWorkspacePanel(original,'editor:second');
    expect(findPanelGroup(next.tree,'editor:second')).toBeUndefined();
    expect(dockedPanels(next.tree).filter(id=>id==='editor:second')).toHaveLength(1);
    expect(next.open).toEqual(original.open);
    expect(findPanelGroup(original.tree,'editor:second')?.panels).toEqual(['editor','editor:second']);
  });
  it('separates a native tool from a floating group and preserves the remaining panel geometry',()=>{
    const grouped=placeWorkspacePanel(defaultWorkspace(),'conversation','files','center',rect),group=findPanelGroup(grouped.tree,'files')!;
    const original=floatWorkspaceGroup(grouped,group,rect),next=isolateWorkspacePanel(original,'files');
    expect(next.floatingGroups).toEqual([]);
    expect(next.rects.conversation).toEqual(rect);
    expect(next.rects.files).toEqual({...rect,x:rect.x+20,y:rect.y+20});
    expect(next.open).toEqual(original.open);
  });
  it('moves a tab group as one unit and preserves order, active member and dimensions',()=>{
    let layout=defaultWorkspace();
    layout=placeWorkspacePanel(layout,'conversation','files','center',rect);
    const group=findPanelGroup(layout.tree,'files')!;
    layout=floatWorkspaceGroup(layout,group,rect);
    expect(layout.floatingGroups[0]).toEqual(group);
    expect(layout.rects[group.id]).toEqual(rect);
    expect(dockedPanels(layout.tree)).not.toContain('files');
    layout=placeWorkspaceGroup(layout,group,'editor','right',rect);
    expect(findPanelGroup(layout.tree,'files')?.panels).toEqual(group.panels);
    expect(findPanelGroup(layout.tree,'files')?.active).toBe(group.active);
  });
  it('restores a narrow sidebar and the complete editor/chat geometry without a 50/50 split',()=>{
    let layout=defaultWorkspace();
    layout={...layout,tree:resizeDockSplit(layout.tree,'initial-files',.14)};
    const bounds={x:0,y:0,width:1200,height:800},before=measureDockTree(layout.tree,bounds).panels;
    layout=hideWorkspacePanel(layout,'files',before.files,true);
    layout=openWorkspacePanel(layout,'files',rect);
    expect(measureDockTree(layout.tree,bounds).panels).toEqual(before);
  });
  it('uses the latest resized width on repeated minimize and close/reopen cycles',()=>{
    let layout=defaultWorkspace();
    const bounds={x:0,y:0,width:1200,height:800};
    for(const [ratio,minimize] of [[.12,true],[.24,true],[.17,false]] as const){
      layout={...layout,tree:resizeDockSplit(layout.tree,'initial-files',ratio)};
      const before=measureDockTree(layout.tree,bounds).panels;
      layout=hideWorkspacePanel(layout,'files',before.files,minimize);
      layout=openWorkspacePanel(layout,'files',rect);
      expect(measureDockTree(layout.tree,bounds).panels).toEqual(before);
    }
  });
  it('restores a resized right-hand panel inside its original parent region',()=>{
    let layout=defaultWorkspace();
    layout={...layout,tree:resizeDockSplit(layout.tree,'initial-chat',.79)};
    const bounds={x:0,y:0,width:1200,height:800},before=measureDockTree(layout.tree,bounds).panels;
    layout=hideWorkspacePanel(layout,'conversation',before.conversation,true);
    layout=openWorkspacePanel(layout,'conversation',rect);
    expect(measureDockTree(layout.tree,bounds).panels).toEqual(before);
  });
  it('restores a nested vertical split height and leaves other columns intact',()=>{
    let layout=placeWorkspacePanel(defaultWorkspace(),'outline','files','bottom',rect);
    if(layout.tree?.type!=='split'||layout.tree.a.type!=='split')throw new Error('Missing outline split');
    layout={...layout,tree:resizeDockSplit(layout.tree,layout.tree.a.id,.31)};
    const bounds={x:0,y:0,width:1200,height:800},before=measureDockTree(layout.tree,bounds).panels;
    layout=hideWorkspacePanel(layout,'outline',before.outline,true);
    layout=openWorkspacePanel(layout,'outline',rect);
    expect(measureDockTree(layout.tree,bounds).panels).toEqual(before);
  });
  it('preserves adjustments made to other panels while the sidebar is minimized',()=>{
    let layout=defaultWorkspace();
    layout={...layout,tree:resizeDockSplit(layout.tree,'initial-files',.16)};
    layout=hideWorkspacePanel(layout,'files',rect,true);
    layout={...layout,tree:resizeDockSplit(layout.tree,'initial-chat',.78)};
    layout=openWorkspacePanel(layout,'files',rect);
    expect(layout.tree?.type==='split'&&layout.tree.ratio).toBe(.16);
    expect(layout.tree?.type==='split'&&layout.tree.b.type==='split'&&layout.tree.b.ratio).toBe(.78);
  });
  it('restores multiple minimized panels in either order without changing their sizes',()=>{
    const bounds={x:0,y:0,width:1200,height:800};
    for(const hidden of [['files','conversation'],['conversation','files']]){
      for(const reopened of [hidden,[...hidden].reverse()]){
        let layout=defaultWorkspace();
        layout={...layout,tree:resizeDockSplit(layout.tree,'initial-files',.13)};
        const before=measureDockTree(layout.tree,bounds).panels;
        for(const id of hidden)layout=hideWorkspacePanel(layout,id,before[id],true);
        for(const id of reopened)layout=openWorkspacePanel(layout,id,rect);
        expect(measureDockTree(layout.tree,bounds).panels).toEqual(before);
      }
    }
  });
  it('uses remaining sibling panels if the original restore target was closed',()=>{
    let layout=defaultWorkspace();
    layout={...layout,tree:resizeDockSplit(layout.tree,'initial-files',.15)};
    layout=hideWorkspacePanel(layout,'files',rect,true);
    layout=hideWorkspacePanel(layout,'editor',rect,false);
    layout=openWorkspacePanel(layout,'files',rect);
    expect(dockedPanels(layout.tree)).toEqual(['files','conversation']);
    expect(layout.tree?.type==='split'&&layout.tree.ratio).toBe(.15);
    expect(layout.open).not.toContain('editor');
  });
  it('merges docked panels, activates a tab, then extracts it without duplicate identities',()=>{
    let layout=placeWorkspacePanel(defaultWorkspace(),'files','editor','center',rect);
    expect(findPanelGroup(layout.tree,'files')?.panels).toEqual(['editor','files']);
    layout=activateWorkspacePanel(layout,'editor');
    expect(findPanelGroup(layout.tree,'files')?.active).toBe('editor');
    const measured=measureDockTree(layout.tree,rect);
    expect(measured.panels.files).toEqual(measured.panels.editor);
    layout=placeWorkspacePanel(layout,'files','conversation','bottom',rect);
    expect(findPanelGroup(layout.tree,'editor')).toBeUndefined();
    expect(dockedPanels(layout.tree).sort()).toEqual(['conversation','editor','files']);
    expect(measureDockTree(layout.tree,rect).panels.files.y).toBeGreaterThan(measureDockTree(layout.tree,rect).panels.conversation.y);
  });
  it('minimizes only one tab and restores it to the same group with its identity',()=>{
    let layout=placeWorkspacePanel(defaultWorkspace(),'outline','editor','center',rect);
    layout=placeWorkspacePanel(layout,'scratch','editor','center',rect);
    layout=hideWorkspacePanel(layout,'outline',rect,true);
    expect(layout.minimized).toEqual(['outline']);
    expect(layout.open).not.toContain('outline');
    expect(findPanelGroup(layout.tree,'scratch')?.panels).toEqual(['editor','scratch']);
    layout=openWorkspacePanel(layout,'outline',rect);
    expect(layout.minimized).toEqual([]);
    expect(findPanelGroup(layout.tree,'outline')?.active).toBe('outline');
    expect(findPanelGroup(layout.tree,'outline')?.panels).toEqual(['editor','scratch','outline']);
  });
  it('restores a minimized split beside its sibling and distinguishes closing from minimizing',()=>{
    let layout=hideWorkspacePanel(defaultWorkspace(),'files',rect,true);
    layout=openWorkspacePanel(layout,'files',rect);
    const measured=measureDockTree(layout.tree,{x:0,y:0,width:1200,height:800});
    expect(measured.panels.files.x).toBeLessThan(measured.panels.editor.x);
    layout=hideWorkspacePanel(layout,'files',rect,false);
    expect(layout.minimized).not.toContain('files');
    expect(layout.open).not.toContain('files');
  });
  it('supports floating tab groups and preserves the frame of the remaining tab when extracting',()=>{
    let layout=openWorkspacePanel(defaultWorkspace(),'scratch',rect);
    layout=placeWorkspacePanel(layout,'outline','scratch','center',rect);
    const group=layout.floatingGroups[0];
    expect(group.panels).toEqual(['scratch','outline']);
    expect(layout.rects[group.id]).toEqual(rect);
    layout=activateWorkspacePanel(layout,'scratch');
    expect(layout.floatingGroups[0].active).toBe('scratch');
    layout=detachWorkspacePanel(layout,'outline');
    expect(layout.floatingGroups).toEqual([]);
    expect(layout.rects.scratch).toEqual(rect);
    expect(layout.open).toContain('outline');
  });
  it('minimizes floating tabs and restores or falls back when the sibling is closed',()=>{
    let layout=openWorkspacePanel(defaultWorkspace(),'scratch',rect);
    layout=placeWorkspacePanel(layout,'outline','scratch','center',rect);
    layout=hideWorkspacePanel(layout,'outline',rect,true);
    layout=openWorkspacePanel(layout,'outline',rect);
    expect(layout.floatingGroups[0].panels).toEqual(['scratch','outline']);
    layout=hideWorkspacePanel(layout,'outline',rect,true);
    layout=hideWorkspacePanel(layout,'scratch',rect,false);
    layout=openWorkspacePanel(layout,'outline',rect);
    expect(layout.floatingGroups).toEqual([]);
    expect(layout.rects.outline).toEqual(rect);
    expect(layout.minimized).toEqual([]);
  });
  it('does not duplicate IDs while moving tabs between two groups',()=>{
    let layout=placeWorkspacePanel(defaultWorkspace(),'outline','editor','center',rect);
    layout=openWorkspacePanel(layout,'scratch',rect);
    layout=placeWorkspacePanel(layout,'files','scratch','center',rect);
    layout=placeWorkspacePanel(layout,'outline','scratch','center',rect);
    layout=placeWorkspacePanel(layout,'files','editor','center',rect);
    const ids=[...dockedPanels(layout.tree),...layout.floatingGroups.flatMap(group=>group.panels)];
    expect(ids.sort()).toEqual(['conversation','editor','files','outline','scratch']);
    expect(new Set(layout.open).size).toBe(layout.open.length);
  });
});
