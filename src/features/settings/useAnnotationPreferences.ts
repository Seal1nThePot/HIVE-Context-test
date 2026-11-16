import {useEffect,useState} from 'react';

export type AnnotationBubblePlacement='left'|'right'|'above'|'below';
export type AnnotationPreferences={version:1;bubblePlacement:AnnotationBubblePlacement};
const key='hive.annotationPreferences.v1';
export const defaultAnnotationPreferences:AnnotationPreferences={version:1,bubblePlacement:'right'};
export function readAnnotationPreferences(raw:string|null):AnnotationPreferences{
  try{
    const value=JSON.parse(raw||'null');
    return value?.version===1&&['left','right','above','below'].includes(value.bubblePlacement)?{version:1,bubblePlacement:value.bubblePlacement}:defaultAnnotationPreferences;
  }catch{return defaultAnnotationPreferences;}
}
export function useAnnotationPreferences(){
  const [preferences,setPreferences]=useState(()=>{try{return readAnnotationPreferences(localStorage.getItem(key));}catch{return defaultAnnotationPreferences;}}),[saveError,setSaveError]=useState('');
  useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(preferences));setSaveError('');}catch{setSaveError('标注偏好暂时无法保存，本次选择仍然生效。');}},[preferences]);
  return {preferences,setPreferences,saveError};
}
