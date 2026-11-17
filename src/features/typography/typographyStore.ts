import {useSyncExternalStore} from 'react';
import {defaultTypography,normalizeTypography,typographyStorageKey,type TypographyPreferences} from './typographyPreferences';

type Snapshot={preferences:TypographyPreferences;saveError:string};
let snapshot:Snapshot|undefined;
const listeners=new Set<()=>void>();
export function getTypographySnapshot():Snapshot{
  if(!snapshot){
    let saved:unknown;
    try{saved=JSON.parse(localStorage.getItem(typographyStorageKey)||'null');}catch{/* Default display also works without localStorage. */}
    snapshot={preferences:normalizeTypography(saved),saveError:''};
  }
  return snapshot;
}
export function subscribeTypography(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function setTypography(next:TypographyPreferences|((previous:TypographyPreferences)=>TypographyPreferences)){
  const current=getTypographySnapshot(),preferences=normalizeTypography(typeof next==='function'?next(current.preferences):next);
  if(JSON.stringify(preferences)===JSON.stringify(current.preferences)&&!current.saveError)return;
  let saveError='';
  try{localStorage.setItem(typographyStorageKey,JSON.stringify(preferences));}catch{saveError='无法保存正文排版设置，本次调整仍然生效。';}
  snapshot={preferences,saveError};listeners.forEach(listener=>listener());
}
const serverSnapshot:Snapshot={preferences:defaultTypography,saveError:''};
export function useTypography(){return {...useSyncExternalStore(subscribeTypography,getTypographySnapshot,()=>serverSnapshot),setTypography};}
