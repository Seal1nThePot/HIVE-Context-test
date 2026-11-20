import {it,expect} from 'vitest';
import {explorerView,flattenEntries,sortEntries,reorderEntry,remapOrder,readOrder,menuActions,independentEntries,selectRange,describeBatchResults,describePreflightFailure,type Entry,type ExplorerOrder} from './explorerState';
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
  expect(menuActions('file')).not.toContain('createFolder');
  expect(menuActions('folder')).not.toContain('createFile');
  expect(menuActions('folder')).not.toContain('createFolder');
  expect(menuActions('folder')).not.toContain('tab');
  expect(menuActions('folder')).not.toContain('duplicate');
  expect(menuActions()).toEqual([]);
  expect(menuActions('file')).not.toContain('openTrash');
  expect(menuActions('folder')).not.toContain('openTrash');
});

it('selects visible ranges without depending on focus and handles a missing anchor',()=>{
  expect(selectRange(['a','b','c','d'],'d','b')).toEqual(['b','c','d']);
  expect(selectRange(['a','c'],'b','c')).toEqual(['c']);
});
it('deduplicates descendants only when their selected ancestor is a folder',()=>{
  const selected:Entry[]=[{name:'a',path:'a',type:'folder'},{name:'b',path:'a/b',type:'folder'},{name:'x',path:'a/b/x.md',type:'file'},{name:'ab',path:'ab/x.md',type:'file'}];
  expect(independentEntries(selected).map(item=>item.path)).toEqual(['a','ab/x.md']);
});

it('reports preflight failure for every selected entry and maps child outcomes to its ancestor',()=>{
  const selected:Entry[]=[{name:'a',path:'a',type:'folder'},{name:'b',path:'a/b.md',type:'file'},{name:'c',path:'c.md',type:'file'}];
  expect(describePreflightFailure(selected,'待保存')).toEqual(['a：未执行：检查未通过：待保存','a/b.md：未执行：检查未通过：待保存','c.md：未执行：检查未通过：待保存']);
  expect(describeBatchResults(selected,[{path:'a',ok:false,error:'冲突'},{path:'c.md',ok:true,warning:'刷新失败'}])).toEqual(['a：失败：冲突','a/b.md：父文件夹 a 未成功，未单独执行：冲突','c.md：成功（刷新失败）']);
  expect(describeBatchResults(selected,[{path:'a',ok:true},{path:'c.md',ok:true}])[1]).toBe('a/b.md：随父文件夹 a 一起处理');
});

it('keeps tree rendering, visible range selection and scoped search equivalent to recursive filtering',()=>{
  const tree:Entry[]=[{name:'z.md',path:'z.md',type:'file'},
    {name:'folder',path:'folder',type:'folder',children:[{name:'a.md',path:'folder/a.md',type:'file'},
      {name:'nested',path:'folder/nested',type:'folder',children:[{name:'b.md',path:'folder/nested/b.md',type:'file'}]}]},
    {name:'other',path:'other',type:'folder',children:[{name:'b.md',path:'other/b.md',type:'file'}]}];
  expect(flattenEntries(tree).map(entry=>entry.path)).toEqual(['z.md','folder','folder/a.md','folder/nested','folder/nested/b.md','other','other/b.md']);
  for(const mode of ['manual','name','modified','created'] as const)
  for(const direction of ['asc','desc'] as const)
  for(const scope of ['','folder','folder/nested','missing'])
  for(const filter of ['','b.md','FOLDER','missing'])
  for(const collapsed of [new Set<string>(),new Set(['folder','folder/nested','other'])])
  for(const hits of [undefined,new Set<string>(),new Set(['folder/nested/b.md','other/b.md'])]){
    const order:ExplorerOrder={mode,direction,parents:{'':['z.md','other','folder'],folder:['folder/nested','folder/a.md']}};
    // Original recursive predicate and visible walk, retained here as a behavioral oracle.
    const matches=(entry:Entry):boolean=>(hits?hits.has(entry.path)||!!entry.children?.some(matches):entry.path.toLowerCase().includes(filter.toLowerCase())||!!entry.children?.some(matches))&&(!scope||entry.path===scope||entry.path.startsWith(scope+'/')||scope.startsWith(entry.path+'/'));
    const rows=new Map<string,Entry[]>();
    const walk=(children:Entry[],parent=''):string[]=>{
      const matching=sortEntries(children,order,parent).filter(matches);rows.set(parent,matching);
      return matching.flatMap(entry=>[entry.path,...(entry.type==='folder'&&(!collapsed.has(entry.path)||!!filter||!!scope)?walk(entry.children||[],entry.path):[])]);
    };
    const expected=walk(tree),view=explorerView(tree,order,collapsed,filter,scope,hits);
    expect(view.paths).toEqual(expected);expect(view.visible).toEqual(new Set(expected));expect(view.rowsByParent).toEqual(rows);
    expect(view.matching.size>0).toBe(flattenEntries(tree).some(matches));
    if(expected.length>1)expect(selectRange(view.paths,expected[0],expected.at(-1)!)).toEqual(expected);
  }
});

it('retains the first manual position for duplicate preference entries',()=>{
  expect(sortEntries(items,{mode:'manual',parents:{'':['b.md','a.md','b.md']}}).map(entry=>entry.path)).toEqual(['b.md','a.md','folder']);
});
