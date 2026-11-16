import {describe,it,expect} from 'vitest';
import {nearestPanelEdge,panelAutoHidePlacement,autoHidePanelRect,withAutoHideMetadata,collapseAutoHidePanel,releaseAutoHidePanel,placeRailIcons,repositionAutoHidePanel} from './autoHide';
import {defaultWorkspace,hideWorkspacePanel,closeWorkspacePanelPreservingAutoHide,openWorkspacePanel,placeWorkspacePanelAtEdge,placeWorkspacePanel} from './workspaceState';
import {dockedPanels,measureDockTree} from './panelLayout';
const bounds={x:40,y:100,width:1200,height:700};
const make=(id='conversation')=>{
  const layout=defaultWorkspace(),rect=measureDockTree(layout.tree,bounds).panels[id];
  return {layout,rect,placement:panelAutoHidePlacement(rect,bounds,true)};
};
describe('nearby panel icons',()=>{
  it('closes and reopens an expanded AI panel without removing either rail icon, even when locked',()=>{
    const {layout,rect,placement}=make();let next=hideWorkspacePanel(layout,'conversation',rect,true,placement);
    const filesRect=measureDockTree(next.tree,bounds).panels.files;
    next=hideWorkspacePanel(next,'files',filesRect,true,panelAutoHidePlacement(filesRect,bounds,true));
    next=openWorkspacePanel({...next,locked:true},'conversation',rect);
    const icons=structuredClone(next.autoHide),tree=structuredClone(next.tree);
    next=closeWorkspacePanelPreservingAutoHide(next,'conversation',rect);
    expect(next.autoHide).toEqual(icons);expect(next.tree).toEqual(tree);expect(next.autoHideActive).toBeNull();expect(next.minimized).toContain('conversation');
    next=openWorkspacePanel(next,'conversation',rect);
    expect(next.autoHideActive).toBe('conversation');expect(next.autoHide).toEqual(icons);
    next=openWorkspacePanel(next,'files',filesRect);
    next=closeWorkspacePanelPreservingAutoHide(next,'conversation',rect);
    expect(next.autoHideActive).toBe('files');expect(next.autoHide).toEqual(icons);
  });
  it('closes an ordinary AI panel without creating a rail icon',()=>{
    const {layout,rect}=make();const closed=closeWorkspacePanelPreservingAutoHide(layout,'conversation',rect);
    expect(closed.open).not.toContain('conversation');expect(closed.autoHide?.conversation).toBeUndefined();expect(closed.minimized).not.toContain('conversation');
  });
  it('packs each half from its top rather than centering icons around offsets',()=>{
    const {positions,extent}=placeRailIcons([{id:'upper-1',offset:.25},{id:'lower-1',offset:.9},{id:'upper-2',offset:.1},{id:'lower-2',offset:.75}],600,28,5);
    expect([...positions]).toEqual([['upper-1',5],['upper-2',38],['lower-1',305],['lower-2',338]]);expect(extent).toBe(600);
  });
  it('moves an icon between side halves without opening it or changing the dock tree',()=>{
    const {layout,rect,placement}=make();const hidden=hideWorkspacePanel(layout,'conversation',rect,true,placement);
    const lower=repositionAutoHidePanel(hidden,'conversation',.8),upper=repositionAutoHidePanel(lower,'conversation',.1);
    expect(lower.autoHide?.conversation.offset).toBe(.75);expect(upper.autoHide?.conversation.offset).toBe(.25);
    expect(upper.tree).toEqual(hidden.tree);expect(upper.open).toEqual(hidden.open);expect(upper.minimized).toEqual(hidden.minimized);
    expect(upper.autoHide?.conversation.edge).toBe('right');expect(upper.autoHide?.conversation.rect).toEqual(rect);
    expect(repositionAutoHidePanel(hidden,'missing',.5)).toBe(hidden);expect(repositionAutoHidePanel(hidden,'conversation',NaN)).toBe(hidden);
  });
  it('keeps side columns on their side and never creates top or bottom icon rails',()=>{
    const {rect}=make();expect(nearestPanelEdge(rect,bounds,true)).toBe('right');
    expect(nearestPanelEdge(measureDockTree(defaultWorkspace().tree,bounds).panels.files,bounds,true)).toBe('left');
    expect(nearestPanelEdge({x:40,y:100,width:1200,height:180},bounds,true)).toBe('left');
    expect(nearestPanelEdge({x:40,y:620,width:1200,height:180},bounds,true)).toBe('left');
  });
  it('chooses the nearest edge for floating windows instead of always sending them left',()=>{
    expect(nearestPanelEdge({x:1050,y:250,width:180,height:350},bounds)).toBe('right');
    expect(nearestPanelEdge({x:50,y:250,width:180,height:350},bounds)).toBe('left');
    expect(nearestPanelEdge({x:500,y:110,width:250,height:180},bounds)).toBe('left');
    expect(nearestPanelEdge({x:900,y:610,width:250,height:180},bounds)).toBe('right');
  });
  it('opens beside the retained icon without resizing or re-docking the main workspace',()=>{
    const {layout,rect,placement}=make();let next=hideWorkspacePanel(layout,'conversation',rect,true,placement);
    const before=structuredClone(next.tree);next=openWorkspacePanel(next,'conversation',rect);
    expect(next.tree).toEqual(before);expect(next.autoHideActive).toBe('conversation');expect(next.autoHide?.conversation).toEqual(placement);
    expect(next.open).toContain('conversation');expect(next.minimized).not.toContain('conversation');expect(dockedPanels(next.tree)).not.toContain('conversation');
    const popup=autoHidePanelRect(placement,bounds);expect(popup.x+popup.width).toBe(bounds.x+bounds.width);expect(popup.width).toBe(rect.width);
  });
  it('collapses the active popup without losing its icon, dimensions or original dock anchor',()=>{
    const {layout,rect,placement}=make();let next=hideWorkspacePanel(layout,'conversation',rect,true,placement),anchor=structuredClone(next.restore.conversation);
    next=openWorkspacePanel(next,'conversation',rect);next=collapseAutoHidePanel(next,'conversation');
    expect(next.autoHideActive).toBeNull();expect(next.minimized).toContain('conversation');expect(next.autoHide?.conversation.rect).toEqual(rect);expect(next.restore.conversation).toEqual(anchor);
  });
  it('switches popups while retaining icons on both edges',()=>{
    const right=make(),leftRect=measureDockTree(right.layout.tree,bounds).panels.files;
    let next=hideWorkspacePanel(right.layout,'conversation',right.rect,true,right.placement);
    next=hideWorkspacePanel(next,'files',leftRect,true,panelAutoHidePlacement(leftRect,bounds,true));
    next=openWorkspacePanel(next,'conversation',right.rect);next=openWorkspacePanel(next,'files',leftRect);
    expect(next.autoHideActive).toBe('files');expect(next.minimized).toContain('conversation');expect(Object.keys(next.autoHide||{})).toEqual(['conversation','files']);
  });
  it('removes the icon when the panel is explicitly placed in a new dock column',()=>{
    const {layout,rect,placement}=make();let next=hideWorkspacePanel(layout,'conversation',rect,true,placement);next=openWorkspacePanel(next,'conversation',rect);
    next=placeWorkspacePanelAtEdge(next,'conversation','left');
    expect(next.autoHide?.conversation).toBeUndefined();expect(next.autoHideActive).toBeNull();expect(dockedPanels(next.tree).filter(id=>id==='conversation')).toHaveLength(1);
  });
  it('distinguishes closing from collapsing, and keeps the original dock restore available',()=>{
    const {layout,rect,placement}=make(),before=measureDockTree(layout.tree,bounds).panels;
    let next=hideWorkspacePanel(layout,'conversation',rect,true,placement);next=openWorkspacePanel(next,'conversation',rect);
    next=hideWorkspacePanel(next,'conversation',rect,false);expect(next.autoHide?.conversation).toBeUndefined();expect(next.minimized).not.toContain('conversation');
    next=openWorkspacePanel(next,'conversation',rect);expect(measureDockTree(next.tree,bounds).panels).toEqual(before);
  });
  it('upgrades minimized records from existing saved views using their dock side',()=>{
    const {layout,rect}=make(),legacy=hideWorkspacePanel(layout,'conversation',rect,true);
    const next=withAutoHideMetadata(legacy,bounds);expect(next.autoHide?.conversation.edge).toBe('right');
    expect(withAutoHideMetadata(next,{...bounds,width:900}).autoHide?.conversation).toEqual(next.autoHide?.conversation);
  });
  it('keeps another tab intact and releases a popup target before creating a floating tab group',()=>{
    const {rect}=make();let layout=placeWorkspacePanel(defaultWorkspace(),'outline','editor','center',rect);
    layout=hideWorkspacePanel(layout,'outline',rect,true,panelAutoHidePlacement(rect,bounds,true,'right'));
    expect(dockedPanels(layout.tree)).toContain('editor');layout=openWorkspacePanel(layout,'outline',rect);
    layout=placeWorkspacePanel(layout,'scratch','outline','center',rect);
    expect(layout.autoHide?.outline).toBeUndefined();expect(layout.floatingGroups[0].panels).toEqual(['outline','scratch']);
  });
  it('places expanded panels beside the left/right edges inside the available workspace',()=>{
    for(const edge of ['left','right'] as const){
      const placement=panelAutoHidePlacement({x:900,y:600,width:320,height:300},bounds,false,edge),rect=autoHidePanelRect(placement,bounds,{x:1230,y:790,width:28,height:28});
      expect(rect.x).toBeGreaterThanOrEqual(bounds.x);expect(rect.y).toBeGreaterThanOrEqual(bounds.y);expect(rect.x+rect.width).toBeLessThanOrEqual(bounds.x+bounds.width);expect(rect.y+rect.height).toBeLessThanOrEqual(bounds.y+bounds.height);
      if(edge==='left')expect(rect.x).toBe(bounds.x);if(edge==='right')expect(rect.x+rect.width).toBe(bounds.x+bounds.width);
    }
  });
  it('migrates old top/bottom icons to a side without losing their active state',()=>{
    const layout=defaultWorkspace();layout.autoHide={outline:{edge:'top',offset:.5,rect:{x:40,y:100,width:1200,height:180}}};layout.open.push('outline');layout.autoHideActive='outline';
    const next=withAutoHideMetadata(layout,bounds);
    expect(next.autoHide?.outline.edge).toBe('left');expect(next.autoHide?.outline.rect.width).toBe(380);expect(next.autoHideActive).toBe('outline');
  });
  it('packs nearby icons without overlap and provides a scroll extent for crowded rails',()=>{
    for(const length of [70,300]){
      const {positions,extent}=placeRailIcons([{id:'a',offset:.9},{id:'b',offset:.9},{id:'c',offset:.95}],length,28,5),values=[...positions.values()].sort((a,b)=>a-b);
      expect(values[0]).toBeGreaterThanOrEqual(0);expect(values[1]-values[0]).toBeGreaterThanOrEqual(33);expect(values[2]-values[1]).toBeGreaterThanOrEqual(33);expect(values[2]+28).toBeLessThanOrEqual(extent);
    }
  });
});


describe('anchored auto-hide popup alignment',()=>{
  it.each(['left','right'] as const)('aligns a tall %s popup to a middle icon and shrinks below it',edge=>{
    const placement={edge,offset:.5,rect:{x:0,y:0,width:300,height:700}};
    const rect=autoHidePanelRect(placement,bounds,{x:40,y:430,width:28,height:28});
    expect(rect.y).toBe(430);expect(rect.height).toBe(370);expect(rect.y+rect.height).toBe(800);
  });
  it('moves upward only enough to preserve minimum header space near the bottom',()=>{
    const placement={edge:'left' as const,offset:.75,rect:{x:0,y:0,width:300,height:700}};
    expect(autoHidePanelRect(placement,bounds,{x:40,y:790,width:28,height:28})).toEqual({x:40,y:720,width:300,height:80});
  });
  it('fits a workspace smaller than the normal minimum size',()=>{
    const placement={edge:'right' as const,offset:.75,rect:{x:0,y:0,width:300,height:700}};
    expect(autoHidePanelRect(placement,{x:10,y:20,width:70,height:50},{x:70,y:60,width:28,height:28})).toEqual({x:10,y:20,width:70,height:50});
  });
});


describe('moving a rail icon between sides',()=>{
  it.each([['left','right'],['right','left']] as const)('moves %s to an empty %s side and preserves placement', (from,to)=>{
    const {layout,rect}=make();const placement=panelAutoHidePlacement(rect,bounds,true,from);
    const hidden=hideWorkspacePanel(layout,'conversation',rect,true,placement);
    const next=repositionAutoHidePanel(hidden,'conversation',.7,to);
    expect(next.autoHide?.conversation).toEqual({...placement,edge:to,offset:.75});
    expect(next.minimized).toEqual(hidden.minimized);expect(next.open).toEqual(hidden.open);expect(next.restore).toEqual(hidden.restore);
  });
  it('appends to rail ordering and collapses an open popup',()=>{
    const {layout,rect,placement}=make();let hidden=hideWorkspacePanel(layout,'conversation',rect,true,placement);
    hidden=hideWorkspacePanel(hidden,'files',rect,true,{...placement,edge:'left'});
    const active={...hidden,autoHideActive:'conversation',open:[...hidden.open,'conversation'],minimized:hidden.minimized.filter(id=>id!=='conversation')};
    const moved=repositionAutoHidePanel(active,'conversation',.1,'left');
    expect(Object.keys(moved.autoHide||{}).slice(-2)).toEqual(['files','conversation']);
    expect(moved.autoHideActive).toBeNull();expect(moved.minimized).toContain('conversation');expect(moved.open).not.toContain('conversation');
  });
  it('rejects invalid values and keeps the side when omitted',()=>{
    const {layout,rect,placement}=make(),hidden=hideWorkspacePanel(layout,'conversation',rect,true,placement);
    expect(repositionAutoHidePanel(hidden,'conversation',Infinity,'left')).toBe(hidden);
    expect(repositionAutoHidePanel(hidden,'conversation',.1,'top' as 'left')).toBe(hidden);
    expect(repositionAutoHidePanel(hidden,'conversation',.1).autoHide?.conversation.edge).toBe(placement.edge);
  });
});
