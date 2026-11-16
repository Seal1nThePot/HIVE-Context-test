import {it,expect} from 'vitest';
import {sortEntries,reorderEntry,remapOrder,readOrder,menuActions,type Entry} from './explorerState';
const items:Entry[]=[{name:'b.md',path:'b.md',type:'file',modifiedAt:3,createdAt:8},{name:'a.md',path:'a.md',type:'file',modifiedAt:5,createdAt:2},{name:'folder',path:'folder',type:'folder',modifiedAt:1,createdAt:1}];
const paths=(order:Parameters<typeof sortEntries>[1])=>sortEntries(items,order).map(item=>item.path);
it('sorts names and timestamps in both directions with folders first',()=>{
  const order=readOrder(null);
  expect(paths({...order,mode:'name',direction:'asc'})).toEqual(['folder','a.md','b.md']);
  expect(paths({...order,mode:'name',direction:'desc'})).toEqual(['folder','b.md','a.md']);
  expect(paths({...order,mode:'modified',direction:'desc'})).toEqual(['folder','a.md','b.md']);
  expect(paths({...order,mode:'modified',direction:'asc'})).toEqual(['folder','b.md','a.md']);
  expect(paths({...order,mode:'created',direction:'desc'})).toEqual(['folder','b.md','a.md']);
  expect(paths({...order,mode:'created',direction:'asc'})).toEqual(['folder','a.md','b.md']);
});
it('preserves separate manual orders through automatic sorting and reordering',()=>{
  const original={mode:'manual' as const,parents:{'':['b.md','folder','a.md'],other:['other/b.md','other/a.md']}};
  const automatic={...original,mode:'name' as const,direction:'asc' as const};
  expect(paths(automatic)).toEqual(['folder','a.md','b.md']);
  expect(paths({...automatic,mode:'manual'})).toEqual(['b.md','folder','a.md']);
  const dragged=reorderEntry(automatic,paths(automatic),'b.md','a.md');
  expect(paths(dragged)).toEqual(['folder','b.md','a.md']);
  expect(dragged.parents.other).toEqual(original.parents.other);
  expect(readOrder(JSON.stringify(dragged))).toEqual(dragged);
});
it('remaps subtree paths and accepts older or malformed preferences',()=>{
  expect(remapOrder({mode:'manual',parents:{a:['a/one.md','a/two.md'],ab:['ab/note.md']}},'a','b/a').parents).toEqual({'b/a':['b/a/one.md','b/a/two.md'],ab:['ab/note.md']});
  expect(paths(readOrder('{"mode":"modified","parents":{}}'))).toEqual(['folder','a.md','b.md']);
  expect(readOrder('{bad')).toEqual({mode:'manual',parents:{}});
  expect(sortEntries(items.map(item=>({...item,path:'constructor/'+item.path})),readOrder(null),'constructor')).toHaveLength(3);
});
it('offers the appropriate context actions for files, folders and empty space',()=>{
  expect(menuActions('file')).toContain('tab');
  expect(menuActions('file')).toContain('duplicate');
  expect(menuActions('file')).not.toContain('createFile');
  expect(menuActions('folder')).toContain('createFile');
  expect(menuActions('folder')).not.toContain('tab');
  expect(menuActions('folder')).not.toContain('duplicate');
  expect(menuActions()).toEqual(['createFile','createFolder']);
  expect(menuActions('file')).not.toContain('openTrash');
  expect(menuActions('folder')).not.toContain('openTrash');
});
