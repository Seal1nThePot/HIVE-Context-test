export type Entry={name:string;path:string;type:'file'|'folder';modifiedAt?:number;createdAt?:number;children?:Entry[]};
export type SortMode='manual'|'name'|'modified'|'created';
export type SortDirection='asc'|'desc';
export type ExplorerOrder={mode:SortMode;direction?:SortDirection;parents:Record<string,string[]>};
export const parentPath=(value:string)=>value.includes('/')?value.slice(0,value.lastIndexOf('/')):'';
export const mapEntryPath=(value:string,from:string,to:string)=>value===from||value.startsWith(from+'/')?to+value.slice(from.length):value;
export const flattenEntries=(items:Entry[]):Entry[]=>items.flatMap(item=>[item,...flattenEntries(item.children||[])]);
export const sortDirection=(order:ExplorerOrder):SortDirection=>order.direction||(order.mode==='name'?'asc':'desc');
export function sortEntries(items:Entry[],order:ExplorerOrder,parent=''):Entry[]{
  const manual=Object.hasOwn(order.parents,parent)?order.parents[parent]:[];
  return [...items].sort((a,b)=>{
    if(order.mode==='manual'){
      const x=manual.indexOf(a.path),y=manual.indexOf(b.path);
      if(x!==y)return (x<0?Infinity:x)-(y<0?Infinity:y);
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
