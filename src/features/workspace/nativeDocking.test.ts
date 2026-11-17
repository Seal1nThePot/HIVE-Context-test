import {describe,it,expect} from 'vitest';
import {initialDockTree,measureDockTree,dockedPanels} from './panelLayout';
import {visibleDockTree,visibleFloatingGroups,railDropAt} from './nativeDocking';
describe('native panel layout projection',()=>{
  it('fills a detached panel slot without changing its return anchor',()=>{
    const home=initialDockTree(),snapshot=structuredClone(home),bounds={x:0,y:0,width:1000,height:600};
    const visible=visibleDockTree(home,['conversation']);
    expect(dockedPanels(visible)).toEqual(['files','editor']);
    const editor=measureDockTree(visible,bounds).panels.editor;
    expect(editor.x+editor.width).toBe(1000);expect(home).toEqual(snapshot);
    expect(dockedPanels(visibleDockTree(home,[]))).toContain('conversation');
  });
  it('removes detached tabs and selects a surviving active tab',()=>{
    expect(visibleFloatingGroups([{type:'group',id:'g',panels:['a','b'],active:'a'}],new Set(['a']))).toEqual([{type:'group',id:'g',panels:['b'],active:'b'}]);
    expect(visibleFloatingGroups([{type:'group',id:'g',panels:['a'],active:'a'}],new Set(['a']))).toEqual([]);
  });
  it('only accepts side drops at the workspace height and within the nearby edge band',()=>{
    const bounds={x:36,y:160,width:928,height:600};
    expect(railDropAt({x:10,y:200},bounds,1000)?.edge).toBe('left');
    expect(railDropAt({x:990,y:700},bounds,1000)).toMatchObject({edge:'right',offset:.75});
    for(const point of [{x:500,y:200},{x:10,y:60},{x:-100,y:200},{x:1100,y:700}])expect(railDropAt(point,bounds,1000)).toBeNull();
  });
});
