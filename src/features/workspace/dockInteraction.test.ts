import {describe,it,expect} from 'vitest';
import {DockIntent,createDockGuides,dockTargetAt,type DockScene,type DockGuide} from './dockInteraction';
import {initialDockTree,insertDockPanel,insertDockPanelAtRoot,measureDockTree,mergeDockPanel,dockedPanels,leaf} from './panelLayout';
const scene=():DockScene=>({panel:'outline',tree:initialDockTree(),bounds:{x:0,y:100,width:1200,height:700},viewport:{x:0,y:0,width:1200,height:900},floating:[],scale:1});
const center=(guide:DockGuide)=>({x:guide.button.x+guide.button.width/2,y:guide.button.y+guide.button.height/2});
const anchor={x:600,y:400};
describe('instant preview and release docking',()=>{
  it('deduplicates equivalent outer and inner desktop placements for a single destination',()=>{
    const state={...scene(),tree:leaf('editor'),dedupeEquivalent:true};
    const guides=createDockGuides(state,dockTargetAt(state,anchor));
    expect(guides.filter(guide=>guide.edge==='left')).toHaveLength(1);
    expect(guides.filter(guide=>guide.edge==='right')).toHaveLength(1);
    expect(guides.find(guide=>guide.edge==='center')).toBeDefined();
    expect(createDockGuides({...state,dedupeEquivalent:false},dockTargetAt(state,anchor))).toHaveLength(9);
  });
  it('keeps different outer and inner desktop outcomes even when they share an arrow direction',()=>{
    const state={...scene(),dedupeEquivalent:true},guides=createDockGuides(state,dockTargetAt(state,anchor));
    expect(guides.filter(guide=>guide.edge==='left')).toHaveLength(2);
    expect(guides.filter(guide=>guide.edge==='left').map(guide=>guide.scope)).toEqual(['workspace','panel']);
  });
  it('removes splits and stacks on locked targets, including a previously visible compass',()=>{
    const state=scene(),intent=new DockIntent(),target=dockTargetAt(state,anchor)!;
    expect(intent.step(anchor,state).guides.length).toBeGreaterThan(0);
    state.positionLockedPanels=[target.id];
    expect(intent.step(anchor,state).guides).toEqual([]);
    state.floating=[{id:'scratch',rect:{x:300,y:250,width:400,height:300},layer:100}];state.positionLockedPanels.push('scratch');
    expect(createDockGuides(state,dockTargetAt(state,anchor))).toEqual([]);
  });
  it('shows controls on the first step without waiting',()=>{
    const result=new DockIntent().step(anchor,scene());
    expect(result.visible).toBe(true);expect(result.guides).toHaveLength(9);expect(result.guides.every(guide=>guide.button.width>=34)).toBe(true);
  });
  it('previews all four inner splits on entry with geometry matching the committed layout',()=>{
    for(const edge of ['left','right','top','bottom'] as const){
      const state=scene(),intent=new DockIntent(),shown=intent.step(anchor,state),guide=shown.guides.find(value=>value.scope==='panel'&&value.edge===edge)!;
      const result=intent.step(center(guide),state);expect(result.ready?.key).toBe(guide.key);
      const tree=insertDockPanel(state.tree,state.panel,guide.target,edge,'actual');
      expect(result.ready?.preview).toEqual(measureDockTree(tree,state.bounds).panels.outline);
    }
  });
  it('previews a tab merge immediately even when the target appears directly under the pointer',()=>{
    const state=scene(),target=dockTargetAt(state,anchor),guide=createDockGuides(state,target).find(value=>value.edge==='center')!;
    const result=new DockIntent().step(center(guide),state);
    expect(result.ready?.edge).toBe('center');expect(result.ready?.target).toBe('editor');
    expect(result.ready?.preview).toEqual(measureDockTree(mergeDockPanel(state.tree,state.panel,'editor'),state.bounds).panels.outline);
  });
  it('keeps ordinary motion through headers and edges free when outside explicit controls',()=>{
    const state=scene(),intent=new DockIntent();
    for(const point of [{x:400,y:120},{x:3,y:400},{x:1198,y:400},{x:600,y:798}])expect(intent.step(point,state).ready).toBeNull();
  });
  it('switches target panels immediately rather than waiting for another pause',()=>{
    const state=scene(),intent=new DockIntent();intent.step(anchor,state);
    const files=measureDockTree(state.tree,state.bounds).panels.files;
    expect(intent.step({x:files.x+files.width/2,y:files.y+files.height/2},state).target?.id).toBe('files');
  });
  it('retains a compass while entering an arrow extending over a neighbouring panel',()=>{
    const state=scene();state.tree={type:'split',id:'small',axis:'x',ratio:.12,a:leaf('files'),b:leaf('editor')};
    const files=measureDockTree(state.tree,state.bounds).panels.files,intent=new DockIntent();
    const shown=intent.step({x:files.x+15,y:files.y+100},state),guide=shown.guides.find(value=>value.scope==='panel'&&value.edge==='right')!;
    const result=intent.step(center(guide),state);expect(result.ready?.target).toBe('files');expect(result.ready?.edge).toBe('right');
  });
  it('removes the preview immediately when moving away and restores it on re-entry',()=>{
    const state=scene(),intent=new DockIntent(),shown=intent.step(anchor,state),guide=shown.guides.find(value=>value.scope==='panel'&&value.edge==='right')!;
    expect(intent.step(center(guide),state).ready).not.toBeNull();
    expect(intent.step({x:400,y:120},state).ready).toBeNull();expect(intent.step(center(guide),state).ready?.key).toBe(guide.key);
    expect(intent.step({x:-20,y:0},state).visible).toBe(false);
  });
  it('Alt cancels a preview and releasing Alt allows an immediate fresh preview',()=>{
    const state=scene(),intent=new DockIntent(),shown=intent.step(anchor,state),point=center(shown.guides.find(value=>value.scope==='workspace'&&value.edge==='left')!);
    expect(intent.step(point,state).ready).not.toBeNull();expect(intent.step({...point,free:true},state).visible).toBe(false);
    expect(intent.step(point,state).ready?.edge).toBe('left');
  });
  it('uses fresh geometry after a target is resized or removed instead of retaining a stale drop',()=>{
    const state=scene(),intent=new DockIntent(),shown=intent.step(anchor,state),guide=shown.guides.find(value=>value.scope==='panel'&&value.edge==='right')!;
    intent.step(center(guide),state);state.bounds={...state.bounds,width:900};
    const changed=intent.step(center(guide),state);expect(changed.guides.find(value=>value.key===guide.key)?.preview).not.toEqual(guide.preview);
    state.tree=null;const removed=intent.step(center(guide),state);expect(removed.guides.every(value=>value.scope==='workspace')).toBe(true);expect(removed.ready?.target).not.toBe('editor');
  });
  it('offers immediate tab merging for floating targets without merging on a header pass',()=>{
    const state=scene();state.floating=[{id:'scratch',rect:{x:400,y:250,width:400,height:400},layer:100}];
    const intent=new DockIntent(),shown=intent.step({x:500,y:265},state);
    expect(shown.ready).toBeNull();expect(shown.guides.filter(value=>value.scope==='panel').map(value=>value.edge)).toEqual(['center']);
    const guide=shown.guides.find(value=>value.edge==='center')!;expect(intent.step(center(guide),state).ready?.target).toBe('scratch');
  });
  it('selects the topmost floating target and ignores the dragged panel itself',()=>{
    const state=scene();state.floating=[{id:'scratch',rect:{x:400,y:250,width:400,height:400},layer:100},{id:'conversation',rect:{x:400,y:250,width:400,height:400},layer:102},{id:'outline',rect:{x:400,y:250,width:400,height:400},layer:104}];
    expect(dockTargetAt(state,anchor)?.id).toBe('conversation');
  });
  it('respects the workspace lock and only offers floating-to-floating tab merges',()=>{
    const state={...scene(),locked:true};expect(createDockGuides(state,null)).toEqual([]);expect(dockTargetAt(state,anchor)).toBeNull();
    state.floating=[{id:'scratch',rect:{x:400,y:250,width:400,height:400},layer:100}];
    const intent=new DockIntent(),target=dockTargetAt(state,anchor),guide=createDockGuides(state,target)[0];
    expect(intent.step(center(guide),state).ready?.target).toBe('scratch');
  });
  it('never offers a tab merge that would hide the protected primary document',()=>{
    const state={...scene(),protectedPanels:['editor']},result=new DockIntent().step(anchor,state);
    expect(result.guides).toHaveLength(8);expect(result.guides.some(value=>value.edge==='center')).toBe(false);
  });
  it('matches all four outer previews to committed rows/columns while retaining inner ratios',()=>{
    const state=scene();
    for(const edge of ['left','right','top','bottom'] as const){
      const root=insertDockPanelAtRoot(state.tree,state.panel,edge,'outer');if(root.type!=='split')throw new Error('missing split');
      expect(edge==='left'||edge==='top'?root.b:root.a).toEqual(state.tree);expect(new Set(dockedPanels(root)).size).toBe(4);
      const guide=createDockGuides(state,null).find(value=>value.edge===edge)!;
      expect(new DockIntent().step(center(guide),state).ready?.preview).toEqual(measureDockTree(root,state.bounds).panels.outline);
    }
  });
  it('supports empty workspaces and keeps controls in bounds at all supported interface scales',()=>{
    const state=scene();state.tree=null;expect(createDockGuides(state,null)).toHaveLength(4);expect(createDockGuides(state,null).every(value=>value.preview.width===1200&&value.preview.height===700)).toBe(true);
    for(const scale of [.8,1,1.5]){state.tree=initialDockTree();state.scale=scale;
      for(const guide of createDockGuides(state,dockTargetAt(state,{x:3,y:110}))){
        expect(guide.button.x).toBeGreaterThanOrEqual(0);expect(guide.button.y).toBeGreaterThanOrEqual(100);expect(guide.button.x+guide.button.width).toBeLessThanOrEqual(1200);expect(guide.button.y+guide.button.height).toBeLessThanOrEqual(800);
      }
    }
  });
});
