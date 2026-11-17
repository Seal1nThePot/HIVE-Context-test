export type Entry={name:string;path:string;type:'file'|'folder';modifiedAt?:number;createdAt?:number;children?:Entry[]};
export type SortMode='manual'|'name'|'modified'|'created';
export type SortDirection='asc'|'desc';
export type ExplorerOrder={mode:SortMode;direction?:SortDirection;parents:Record<string,string[]>};
export const parentPath=(value:string)=>value.includes('/')?value.slice(0,value.lastIndexOf('/')):'';
export const mapEntryPath=(value:string,from:string,to:string)=>value===from||value.startsWith(from+'/')?to+value.slice(from.length):value;
export function flattenEntries(items:Entry[]):Entry[]{
  const result:Entry[]=[];
  const visit=(entries:Entry[])=>{for(const entry of entries){result.push(entry);if(entry.children)visit(entry.children);}};
  visit(items);return result;
}
export const sortDirection=(order:ExplorerOrder):SortDirection=>order.direction||(order.mode==='name'?'asc':'desc');
export function sortEntries(items:Entry[],order:ExplorerOrder,parent=''):Entry[]{
  const manual=Object.hasOwn(order.parents,parent)?order.parents[parent]:[];
  const positions=new Map<string,number>();
  if(order.mode==='manual')for(let index=0;index<manual.length;index++)if(!positions.has(manual[index]))positions.set(manual[index],index);
  return [...items].sort((a,b)=>{
    if(order.mode==='manual'){
      const x=positions.get(a.path)??Infinity,y=positions.get(b.path)??Infinity;
      if(x!==y)return x-y;
    }
    if(a.type!==b.type)return a.type==='folder'?-1:1;
    const direction=sortDirection(order)==='asc'?1:-1;
    if(order.mode==='modified'||order.mode==='created'){
      const field=order.mode==='modified'?'modifiedAt':'createdAt';
      const x=a[field],y=b[field];
      if(x==null&&y!=null)return 1;
      if(x!=null&&y==null)return -1;
      if(x!=null&&y!=null&&x!==y)return (x-y)*direction;
    }
    return a.name.localeCompare(b.name,'zh-CN',{numeric:true})*(order.mode==='name'?direction:1);
  });
}

/** Compute filtering once per entry and share the same sibling order with rendering and selection. */
export function explorerView(items:Entry[],order:ExplorerOrder,collapsed:ReadonlySet<string>,filter:string,scope:string,resultPaths?:ReadonlySet<string>){
  const matching=new Set<string>(),query=filter.toLowerCase();
  const match=(entry:Entry):boolean=>{
    let descendant=false;
    for(const child of entry.children||[])if(match(child))descendant=true;
    const found=(resultPaths?resultPaths.has(entry.path):entry.path.toLowerCase().includes(query))||descendant;
    const inScope=!scope||entry.path===scope||entry.path.startsWith(scope+'/')||scope.startsWith(entry.path+'/');
    if(found&&inScope)matching.add(entry.path);
    // Ancestor matching uses the child's scoped result, as in the original recursive filter.
    return found&&inScope;
  };
  for(const entry of items)match(entry);
  const rowsByParent=new Map<string,Entry[]>(),paths:string[]=[];
  const visit=(children:Entry[],parent:string)=>{
    const rows=sortEntries(children,order,parent).filter(entry=>matching.has(entry.path));
    rowsByParent.set(parent,rows);
    for(const entry of rows){paths.push(entry.path);if(entry.type==='folder'&&(!collapsed.has(entry.path)||!!filter||!!scope))visit(entry.children||[],entry.path);}
  };
  visit(items,'');
  return {rowsByParent,paths,visible:new Set(paths),matching};
}
export function reorderEntry(order:ExplorerOrder,siblings:string[],path:string,before?:string):ExplorerOrder{
  const values=siblings.filter(value=>value!==path),index=before?values.indexOf(before):-1;
  values.splice(index<0?values.length:index,0,path);
  return {...order,mode:'manual',parents:{...order.parents,[parentPath(path)]:values}};
}
export function remapOrder(order:ExplorerOrder,from:string,to:string):ExplorerOrder{
  return {...order,parents:Object.fromEntries(Object.entries(order.parents).map(([key,paths])=>[mapEntryPath(key,from,to),paths.map(value=>mapEntryPath(value,from,to))]))};
}
export function readOrder(value:string|null):ExplorerOrder{
  try{const data=JSON.parse(value||'null');if(!data||!['manual','name','modified','created'].includes(data.mode)||!data.parents||typeof data.parents!=='object'||Array.isArray(data.parents))throw 0;
    const parents=Object.fromEntries(Object.entries(data.parents).filter(([key,values])=>key.length<2000&&Array.isArray(values)&&values.length<=10000&&values.every(value=>typeof value==='string')));
    return {mode:data.mode,...(data.direction==='asc'||data.direction==='desc'?{direction:data.direction}:{}),parents:parents as Record<string,string[]>};
  }catch{return {mode:'manual',parents:{}};}
}
export function menuActions(type?:Entry['type']):string[]{
  return [
    ...(type==='file'?['tab']:[]),
    ...(type!=='file'?['createFile']:[]),
    'createFolder',
    ...(type==='file'?['duplicate']:[]),
    ...(type?['move',...(type==='folder'?['search']:[]),'copy','reveal','ai','rename','trash']:[]),
  ];
}

/** Select each top-level operation once; a selected folder includes its descendants. */
export function independentEntries(items:Entry[]):Entry[]{
  return items.filter(item=>!items.some(other=>other.type==='folder'&&other.path!==item.path&&item.path.startsWith(other.path+'/')));
}
export function selectRange(paths:string[],anchor:string,target:string):string[]{
  const start=paths.indexOf(anchor),end=paths.indexOf(target);
  return start<0||end<0?[target]:paths.slice(Math.min(start,end),Math.max(start,end)+1);
}

export type BatchItemResult={path:string;ok:boolean;error?:string;warning?:string};
export function describeBatchResults(entries:Entry[],results:BatchItemResult[]):string[]{
  const roots=independentEntries(entries);
  return entries.map(item=>{
    const root=roots.find(candidate=>candidate.path===item.path||(candidate.type==='folder'&&item.path.startsWith(candidate.path+'/')));
    const result=results.find(value=>value.path===root?.path);
    if(!result)return item.path+'：未执行：未收到处理结果';
    if(root?.path!==item.path)return item.path+'：'+(result.ok?'随父文件夹 '+root?.path+' 一起处理'+(result.warning?'（'+result.warning+'）':''):'父文件夹 '+root?.path+' 未成功，未单独执行'+(result.error?'：'+result.error:''));
    return item.path+'：'+(result.ok?'成功'+(result.warning?'（'+result.warning+'）':''):'失败：'+(result.error||'未知错误'));
  });
}
export function describePreflightFailure(entries:Entry[],message:string):string[]{return entries.map(item=>item.path+'：未执行：检查未通过：'+message);}
