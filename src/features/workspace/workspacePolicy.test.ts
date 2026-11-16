import {describe,it,expect} from 'vitest';
import {defaultWorkspace,detachWorkspacePanel,hideWorkspacePanel,placeWorkspacePanel} from './workspaceState';
import {canDockAutoHideRail,dockAutoHideRail,canMovePanel,canPlacePanel,retainPrimaryEditor,openDockedPanel,openContentsPanel,openTrashPanel,rankedFloatingLayers,fitPanelInStage,isPanelPositionLocked,togglePanelPositionLock,canResizeSplit} from './workspacePolicy';
import {dockedPanels,measureDockTree} from './panelLayout';
import {panelAutoHidePlacement} from './autoHide';
const bounds={x:36,y:160,width:1200,height:700},rect={x:100,y:180,width:300,height:400};
describe('pulling a rail into a dock column',()=>{
  const place=(edge:'left'|'right',offset:number)=>({edge,offset,rect:{x:0,y:0,width:250,height:300}});
  it('preserves rail order and active tab in two equal-height groups',()=>{
    const base=defaultWorkspace();const layout={...base,open:base.open.filter(id=>id!=='files'),minimized:['files','toc','trash'],autoHide:{toc:place('left',.25),files:place('left',.25),trash:place('left',.75)},autoHideActive:'files'};
    const next=dockAutoHideRail(layout,'left',300,1200);expect(next.tree?.type).toBe('split');
    if(next.tree?.type!=='split'||next.tree.a.type!=='split')throw Error('expected column');
    expect(next.tree.ratio).toBe(.25);expect(next.tree.a.ratio).toBe(.5);
    expect(next.tree.a.a).toMatchObject({type:'group',panels:['toc','files'],active:'files'});expect(next.tree.a.b).toEqual({type:'panel',panel:'trash'});
    expect(next.autoHide).toEqual({});expect(new Set(dockedPanels(next.tree)).size).toBe(dockedPanels(next.tree).length);expect(dockedPanels(next.tree)).toContain('editor');
  });
  it('uses full height for one half and honors locks',()=>{
    const base=defaultWorkspace();const layout={...base,autoHide:{toc:place('right',.75)},minimized:['toc']};
    expect(canDockAutoHideRail(layout,'right')).toBe(true);expect(canDockAutoHideRail(layout,'left')).toBe(false);
    expect(canDockAutoHideRail({...layout,locked:true},'right')).toBe(false);expect(canDockAutoHideRail({...layout,lockedPanels:['toc']},'right')).toBe(false);
    const next=dockAutoHideRail(layout,'right',240,1200);expect(next.tree).toMatchObject({type:'split',axis:'x',ratio:.8,b:{type:'panel',panel:'toc'}});
    expect(dockAutoHideRail({...layout,locked:true},'right',240,1200).tree).toEqual(layout.tree);
    expect(dockAutoHideRail({...layout,lockedPanels:['toc']},'right',240,1200).tree).toEqual(layout.tree);
    expect(dockAutoHideRail({...layout,lockedPanels:['files']},'right',240,1200).tree).toEqual(layout.tree);
  });
});
describe('fixed document workspace',()=>{
  it('opens trash as a file-sidebar tab, preserving the manuscript geometry and respecting locks',()=>{
    const layout=defaultWorkspace(),before=measureDockTree(layout.tree,bounds).panels.editor,next=openTrashPanel(layout,rect);
    expect(measureDockTree(next.tree,bounds).groups[0].panels).toEqual(['files','trash']);expect(measureDockTree(next.tree,bounds).panels.editor).toEqual(before);
    const locked=togglePanelPositionLock(layout,'files'),floating=openTrashPanel(locked,rect);expect(floating.tree).toEqual(layout.tree);expect(floating.open).toContain('trash');expect(floating.rects.trash).toEqual(rect);
  });
  it('locks docked positions but allows floating tool movement without hiding contents',()=>{
    let layout=defaultWorkspace();layout.open.push('scratch');layout.rects.scratch=rect;
    layout=togglePanelPositionLock(layout,'scratch');expect(canMovePanel(layout,'scratch')).toBe(true);expect(canPlacePanel(layout,'scratch','editor','left')).toBe(false);expect(canMovePanel(layout,'files')).toBe(true);
    const hidden=hideWorkspacePanel(layout,'scratch',rect,false);expect(hidden.open).not.toContain('scratch');expect(isPanelPositionLocked(hidden,'scratch')).toBe(true);
    layout=togglePanelPositionLock(layout,'scratch');expect(canMovePanel(layout,'scratch')).toBe(true);
    layout=togglePanelPositionLock(layout,'files');expect(canMovePanel(layout,'files')).toBe(false);expect(layout.open).toContain('files');expect(togglePanelPositionLock(layout,'editor')).toBe(layout);
  });
  it('allows locked floating tools to move even under the workspace lock but keeps editor rules',()=>{
    const layout=defaultWorkspace();layout.open.push('outline','scratch','editor:second');layout.locked=true;layout.lockedPanels=['outline','scratch','editor:second'];
    expect(canMovePanel(layout,'outline')).toBe(true);expect(canMovePanel(layout,'scratch')).toBe(true);expect(canMovePanel(layout,'editor:second')).toBe(false);expect(canMovePanel(layout,'editor')).toBe(false);
    expect(canPlacePanel(layout,'outline','scratch','center')).toBe(false);
  });
  it('locks and unlocks a shared tab frame through either member',()=>{
    let layout=placeWorkspacePanel(defaultWorkspace(),'toc','files','center',rect);
    layout=togglePanelPositionLock(layout,'toc');expect(isPanelPositionLocked(layout,'files')).toBe(true);expect(canMovePanel(layout,'files')).toBe(false);
    expect(canPlacePanel(layout,'scratch','toc','center')).toBe(false);
    layout=togglePanelPositionLock(layout,'files');expect(isPanelPositionLocked(layout,'toc')).toBe(false);expect(layout.lockedPanels).toEqual([]);
  });
  it('protects locked targets and their split dividers while leaving unrelated splits editable',()=>{
    let layout=defaultWorkspace();layout.open.push('scratch');layout=togglePanelPositionLock(layout,'files');
    expect(canPlacePanel(layout,'scratch','files','right')).toBe(false);expect(canPlacePanel(layout,'scratch','','left')).toBe(false);
    expect(canPlacePanel(layout,'scratch','editor','right')).toBe(true);
    const dividers=measureDockTree(layout.tree,bounds).dividers;
    expect(dividers.map(divider=>canResizeSplit(layout,divider.id))).toContain(false);
    const root=layout.tree;expect(root?.type==='split'&&canResizeSplit(layout,root.id)).toBe(false);
    const contents=openContentsPanel(layout,rect);expect(contents.tree).toEqual(layout.tree);expect(contents.open).toContain('toc');
  });
  it('opens a new contents panel as a file-sidebar tab without moving the main document',()=>{
    const layout=defaultWorkspace(),before=measureDockTree(layout.tree,bounds).panels.editor,next=openContentsPanel(layout,rect),measured=measureDockTree(next.tree,bounds);
    expect(measured.groups[0].panels).toEqual(['files','toc']);expect(measured.groups[0].active).toBe('toc');expect(measured.panels.editor).toEqual(before);
  });
  it('opens contents at the left when no docked files exist, respecting a locked workspace',()=>{
    const layout=detachWorkspacePanel(defaultWorkspace(),'files'),next=openContentsPanel(layout,rect);
    expect(dockedPanels(next.tree)).toContain('toc');expect(next.tree?.type==='split'&&next.tree.a).toEqual({type:'panel',panel:'toc'});
    layout.locked=true;const locked=openContentsPanel(layout,rect);expect(locked.tree).toEqual(layout.tree);expect(locked.open).toContain('toc');expect(locked.rects.toc).toEqual(rect);
  });
  it('retains a contents panel that was previously placed in a floating position',()=>{
    const layout=defaultWorkspace();layout.rects.toc=rect;
    const reopened=openContentsPanel(layout,rect);expect(reopened.tree).toEqual(layout.tree);expect(reopened.rects.toc).toEqual(rect);
  });
  it('repairs a legacy floating or hidden main document without losing other panels',()=>{
    for(const hidden of [false,true]){
      const layout=detachWorkspacePanel(defaultWorkspace(),'editor');
      if(hidden){layout.open=layout.open.filter(id=>id!=='editor');layout.minimized.push('editor');layout.autoHide={editor:panelAutoHidePlacement(rect,bounds)};}
      const next=retainPrimaryEditor(layout);
      expect(next.open).toContain('editor');expect(dockedPanels(next.tree)).toEqual(expect.arrayContaining(['editor','files','conversation']));expect(next.minimized).not.toContain('editor');expect(next.autoHide?.editor).toBeUndefined();
    }
  });
  it('separates an old tool/document tab group so tools cannot hide the main document',()=>{
    const old=placeWorkspacePanel(defaultWorkspace(),'outline','editor','center',rect),next=retainPrimaryEditor(old);
    const measured=measureDockTree(next.tree,bounds);
    expect(measured.groups.some(group=>group.panels.includes('editor'))).toBe(false);expect(measured.panels.editor).not.toEqual(measured.panels.outline);expect(next.open).toContain('outline');
  });
  it('preserves document-only primary tabs while preventing tools from joining any tab in that group',()=>{
    const next=retainPrimaryEditor(placeWorkspacePanel(defaultWorkspace(),'editor:second','editor','center',rect));
    expect(measureDockTree(next.tree,bounds).groups[0].panels).toEqual(['editor','editor:second']);
    expect(canMovePanel(next,'editor')).toBe(false);expect(canPlacePanel(next,'outline','editor:second','center')).toBe(false);expect(canPlacePanel(next,'editor:third','editor','center')).toBe(true);
  });
  it('keeps the primary immovable, allows an extra visible editor to float, and rejects stacking on primary',()=>{
    const layout=defaultWorkspace();expect(canMovePanel(layout,'editor')).toBe(false);expect(canMovePanel(layout,'editor:second')).toBe(false);
    layout.open.push('editor:second');expect(canMovePanel(layout,'editor:second')).toBe(true);expect(canPlacePanel(layout,'outline','editor','center')).toBe(false);expect(canPlacePanel(layout,'outline','editor','left')).toBe(true);
  });
  it('locks docked positions and incoming dock changes while allowing free floating stacks',()=>{
    const layout=defaultWorkspace();layout.locked=true;layout.open.push('outline','scratch');
    expect(canMovePanel(layout,'files')).toBe(false);expect(canMovePanel(layout,'outline')).toBe(true);
    for(const edge of ['left','right','top','bottom','center'])expect(canPlacePanel(layout,'outline','editor',edge)).toBe(false);
    expect(canPlacePanel(layout,'outline','scratch','center')).toBe(true);
  });
  it('opens a right-side icon as a new right column and removes its temporary popup',()=>{
    const layout=defaultWorkspace(),before=measureDockTree(layout.tree,bounds).panels;
    const hidden=hideWorkspacePanel(layout,'conversation',before.conversation,true,panelAutoHidePlacement(before.conversation,bounds,true));
    const next=openDockedPanel(hidden,'conversation',rect);
    const panels=measureDockTree(next.tree,bounds).panels;
    expect(next.autoHide?.conversation).toBeUndefined();expect(next.autoHideActive).toBeFalsy();expect(next.minimized).not.toContain('conversation');
    expect(panels.conversation.x).toBeGreaterThan(panels.editor.x);expect(panels.conversation.x+panels.conversation.width).toBe(bounds.x+bounds.width);
    expect(dockedPanels(next.tree).filter(id=>id==='conversation')).toHaveLength(1);
  });
  it('uses the icon side instead of a stale restore anchor on the opposite side',()=>{
    let layout=defaultWorkspace();const panels=measureDockTree(layout.tree,bounds).panels;
    layout=hideWorkspacePanel(layout,'files',panels.files,true,panelAutoHidePlacement(panels.files,bounds,true,'right'));
    const next=openDockedPanel(layout,'files',rect),after=measureDockTree(next.tree,bounds).panels;
    expect(after.files.x).toBeGreaterThan(after.conversation.x);expect(after.files.height).toBe(after.conversation.height);
    expect(after.editor).toEqual(measureDockTree(layout.tree,bounds).panels.editor);
    expect(after.files.width).toBeCloseTo(after.conversation.width);
  });
  it('splits an existing side tool column into two adjacent full-height columns without resizing the manuscript',()=>{
    let layout=defaultWorkspace();layout.open.push('outline');layout.rects.outline=rect;
    layout=hideWorkspacePanel(layout,'outline',rect,true,panelAutoHidePlacement(rect,bounds,false,'right'));
    const before=measureDockTree(layout.tree,bounds).panels;
    const next=openDockedPanel(layout,'outline',rect),after=measureDockTree(next.tree,bounds).panels;
    expect(after.editor).toEqual(before.editor);expect(after.files).toEqual(before.files);
    expect(after.outline.x).toBeGreaterThan(after.conversation.x);expect(after.outline.y).toBe(after.conversation.y);
    expect(after.outline.height).toBe(before.conversation.height);expect(after.outline.x+after.outline.width).toBe(before.conversation.x+before.conversation.width);
  });
  it('retains temporary expansion while dock placement is locked',()=>{
    for(const lock of ['workspace','source','target'] as const){
      let layout=defaultWorkspace();layout.open.push('outline');layout=hideWorkspacePanel(layout,'outline',rect,true,panelAutoHidePlacement(rect,bounds,false,'right'));
      if(lock==='workspace')layout.locked=true;else layout.lockedPanels=[lock==='source'?'outline':'conversation'];
      const next=openDockedPanel(layout,'outline',rect);
      expect(next.tree).toEqual(layout.tree);expect(next.autoHideActive).toBe('outline');expect(next.autoHide?.outline.edge).toBe('right');
    }
  });
  it('opening a floating tool docks it alongside the permanent document',()=>{
    const layout=defaultWorkspace();layout.open.push('outline');
    const next=openDockedPanel(layout,'outline',rect);
    expect(dockedPanels(next.tree)).toContain('outline');expect(dockedPanels(next.tree)).toContain('editor');
  });
  it('caps thousands of focus operations below popup and shortcut controls, including old view layers',()=>{
    let layers={first:9999999,second:Infinity};
    for(let i=0;i<3000;i++)layers=rankedFloatingLayers(layers,i%2?'first':'second') as typeof layers;
    expect(layers.first).toBeGreaterThan(layers.second);expect(Math.max(...Object.values(layers))).toBeLessThan(1000);
  });
  it('ranks an expanded rail panel and ordinary floating panels in one order',()=>{
    const expanded=rankedFloatingLayers({tool:100},'rail-panel');
    expect(expanded['rail-panel']).toBeGreaterThan(expanded.tool);
    const focused=rankedFloatingLayers(expanded,'tool');
    expect(focused.tool).toBeGreaterThan(focused['rail-panel']);
  });
  it('keeps floating titles inside the writing workspace, clear of header and side rails',()=>{
    const fit=fitPanelInStage({x:-100,y:0,width:1400,height:1000},bounds);
    expect(fit).toEqual(bounds);expect(fitPanelInStage(rect,bounds)).toEqual(rect);
  });
});
