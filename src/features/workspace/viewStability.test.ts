import {describe,it,expect} from 'vitest';
import {parseViewCollection} from './viewPresets';
import {defaultWorkspace} from './workspaceState';
import {defaultAppearance} from '../settings/useAppearance';

function record(){return {version:1,views:[{id:'view',name:'stability',mode:'discuss',updatedAt:'2026-11-17T12:00:00.000Z',layout:defaultWorkspace(),editors:[{id:'editor',file:'draft.md',anchor:0,head:0,scrollTop:0}],activeEditor:'editor',appearance:defaultAppearance,statusItems:['count'],filter:'',collapsed:[],chatOrb:false,orbBounds:{width:344,height:520}}]};}
describe('corrupted saved layout injection',()=>{
  it('rejects 1000 seeded structural corruptions while the valid record remains loadable',()=>{
    const valid=JSON.stringify(record());expect(parseViewCollection(valid).views).toHaveLength(1);let seed=20261117;
    for(let index=0;index<1000;index++){
      seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;const value=record(),view=value.views[0];
      switch((seed>>>0)%8){
        case 0:view.layout.open.push('unknown-panel');break;
        case 1:view.layout.open.push('files');break;
        case 2:view.layout.minimized.push('editor');break;
        case 3:view.layout.rects.files={x:0,y:0,width:-1,height:400};break;
        case 4:view.activeEditor='editor:missing';break;
        case 5:view.layout.tree={type:'group',id:'broken',panels:['files','conversation'],active:'unknown'};break;
        case 6:view.layout.tree={type:'panel',panel:'__proto__'};break;
        default:view.layout.rects.files={x:Infinity,y:0,width:300,height:400};
      }
      expect(()=>parseViewCollection(JSON.stringify(value)),`corruption ${index}`).toThrow();
    }
    expect(parseViewCollection(valid).views[0].layout.open).toEqual(['files','editor','conversation']);expect(Object.prototype).not.toHaveProperty('polluted');
  });
  it('rejects excessive depth, truncated JSON and oversized stored records without a stack overflow',()=>{
    let nested:unknown={};for(let index=0;index<100;index++)nested={next:nested};
    for(const raw of [JSON.stringify(nested),'{"version":1,"views":[',' '.repeat(2000001)])expect(()=>parseViewCollection(raw)).toThrow();
  });
});
