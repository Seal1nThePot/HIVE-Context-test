import {describe,it,expect} from 'vitest';
import {referenceDragData,readReferenceDrag} from './referenceDrag';
describe('cross-window reference payload',()=>{
  it('round trips a portable document or folder and rejects another workspace',()=>{
    for(const source of [{path:'资料/稿.md',type:'file' as const},{path:'资料',type:'folder' as const}]){
      const raw=referenceDragData('current',source);expect(readReferenceDrag(raw,'current')).toEqual(source);expect(readReferenceDrag(raw,'other')).toBeNull();
    }
  });
  it('does not admit images, traversal, malformed data, or hidden paths as text references',()=>{
    for(const path of ['../稿.md','a/../稿.md','a\\稿.md','.hive/稿.md','图.png','/稿.md'])expect(readReferenceDrag(referenceDragData('space',{path,type:'file'}),'space')).toBeNull();
    expect(readReferenceDrag('{','space')).toBeNull();
  });
});
