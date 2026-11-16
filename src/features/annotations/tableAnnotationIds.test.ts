import {describe,it,expect} from 'vitest';
import {tableAnnotationIds,clampAnnotationPosition,placeAnnotationWindow} from './InlineAnnotationEditor';
describe('table annotation metadata',()=>{
  it('reads only string ids and tolerates malformed metadata',()=>{
    const cell=(value:string)=>({dataset:{tableAnnotationIds:value}} as unknown as HTMLElement);
    expect(tableAnnotationIds(cell('["first","second",12]'))).toEqual(['first','second']);
    expect(tableAnnotationIds(cell('bad'))).toEqual([]);
    expect(tableAnnotationIds(cell('{}'))).toEqual([]);
  });
});


it('keeps a dragged or anchored window inside a resized viewport',()=>{
  expect(clampAnnotationPosition({x:950,y:730},300,200,1000,800)).toEqual({x:692,y:592});
  expect(clampAnnotationPosition({x:-20,y:-10},300,200,1000,800)).toEqual({x:8,y:8});
  expect(clampAnnotationPosition({x:100,y:100},300,200,200,100)).toEqual({x:8,y:8});
});

it('places the window outside its marked target even near the viewport edge',()=>{
  const target={left:600,top:450,right:790,bottom:590};
  const p=placeAnnotationWindow({x:790,y:500},target,360,180,800,600);
  expect(p.x+p.width<=target.left||p.x>=target.right||p.y+p.height<=target.top||p.y>=target.bottom).toBe(true);
  expect(p.x).toBeGreaterThanOrEqual(0);expect(p.y).toBeGreaterThanOrEqual(0);
  expect(p.x+p.width).toBeLessThanOrEqual(800);expect(p.y+p.height).toBeLessThanOrEqual(600);
});
