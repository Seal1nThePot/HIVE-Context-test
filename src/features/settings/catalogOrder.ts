export type CatalogModelLike={id:string;name?:string};

/** 模型选择列表按名称 A→Z（忽略大小写、数字按其数值比较），重名时用 id 兜底；不改动入参数组。 */
export function sortCatalogModels<T extends CatalogModelLike>(list:readonly T[]):T[]{
  const label=(m:CatalogModelLike)=>m.name||m.id;
  return [...list].sort((a,b)=>label(a).localeCompare(label(b),'en',{sensitivity:'base',numeric:true})||a.id.localeCompare(b.id,'en'));
}
