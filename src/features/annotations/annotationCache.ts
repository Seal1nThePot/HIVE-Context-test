/** Limit reloadable, inactive records; unsaved or in-flight records remain recoverable. */
export function pruneAnnotationCache<T extends {text:string;seq:number;savedSeq:number;busy:boolean;loading?:boolean;error:string}>(cache:Map<string,T>,active:T|undefined,maxRecords=12,maxCharacters=4*1024*1024){
  const eligible=[...cache.entries()].filter(([,record])=>record!==active&&!record.busy&&!record.loading&&!record.error&&record.seq===record.savedSeq);
  let characters=eligible.reduce((sum,[,record])=>sum+record.text.length,0),count=eligible.length;
  for(const [key,record] of eligible){
    if(count<=maxRecords&&characters<=maxCharacters)break;
    cache.delete(key);count--;characters-=record.text.length;
  }
}
