import {describe,expect,it} from 'vitest';
import {dockedPanels,measureDockTree} from './panelLayout';
import {floatingContent,floatingDropContent,pruneFloatingGroup} from './floatingLayout';
import {defaultWorkspace,detachWorkspacePanel,floatWorkspaceGroup,hideWorkspacePanel,openWorkspacePanel} from './workspaceState';

const rect={x:1800,y:70,width:640,height:480};
describe('floating workspace panes',()=>{
  it('merges a third panel into a single pane of an existing split',()=>{
    const pair=floatingDropContent(undefined,'properties',undefined,'scratch','right');
    const triple=floatingDropContent(pair,'scratch',undefined,'basis','center');
    const measured=measureDockTree(floatingContent(triple),rect);
    expect(measured.groups[0].panels).toEqual(['scratch','basis']);
    expect(measured.groups[0].active).toBe('basis');
    expect(measured.panels.properties.x).toBeLessThan(measured.panels.scratch.x);
    expect(measured.panels.scratch).toEqual(measured.panels.basis);
    const extracted=pruneFloatingGroup(triple,['properties','basis']);
    expect(dockedPanels(floatingContent(extracted))).toEqual(['properties','basis']);
    expect(measureDockTree(floatingContent(extracted),rect).panels.basis).toEqual(measured.panels.basis);
  });
  it('reopens a closed member on its original side, leaving the writing workspace alone',()=>{
    const baseline=defaultWorkspace(),original={...baseline,open:[...baseline.open,'outline','properties']};
    const pair=floatingDropContent(undefined,'outline',undefined,'properties','top');
    const joined=floatWorkspaceGroup(original,pair,rect);
    const reopened=openWorkspacePanel(hideWorkspacePanel(joined,'properties',rect,false),'properties',rect);
    expect(reopened.tree).toEqual(baseline.tree);
    const frame=measureDockTree(floatingContent(reopened.floatingGroups[0]),rect);
    expect(frame.panels.properties.y).toBeLessThan(frame.panels.outline.y);
    expect(detachWorkspacePanel(reopened,'properties').rects.outline).toEqual(rect);
  });
});
