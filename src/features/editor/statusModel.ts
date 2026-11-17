import type {Text} from '@codemirror/state';
import {markdownContent} from '../../shared/markdownContent';

export const statusItems=[['save','保存状态'],['count','总字数'],['selection','选中字数'],['position','行与列'],['lines','总行数'],['paragraphs','段落数量'],['eol','换行符'],['encoding','编码'],['format','文件格式']] as const;
export type StatusKey=typeof statusItems[number][0];
export type CountMode='characters'|'text';
export type StatusOptions={items:StatusKey[];countMode:CountMode};
export const defaultStatus:StatusKey[]=['count'];
export const countDescription='字符数含标点；纯字数仅计文字和数字。两者均不计空白与 Markdown 标记。';
export const paragraphDescription='普通段落、标题和每条列表项分别计数；连续换行不另起段落，代码块和空行不计。';
export const statusLabel=(key:StatusKey)=>statusItems.find(item=>item[0]===key)![1];
export const isStatusKey=(value:unknown):value is StatusKey=>statusItems.some(([key])=>key===value);
export function normalizeStatus(value:unknown):StatusKey[]{
  return Array.isArray(value)?[...new Set(value.filter(isStatusKey))]:[...defaultStatus];
}
export function normalizeStatusOptions(value:unknown):StatusOptions{
  if(Array.isArray(value))return {items:normalizeStatus(value),countMode:'characters'};
  const current=value&&typeof value==='object'?value as Partial<StatusOptions>:{};
  return {items:normalizeStatus(current.items),countMode:current.countMode==='text'?'text':'characters'};
}
export function readStatusOptions(storage:Pick<Storage,'getItem'>):StatusOptions{
  for(const [key,legacy] of [['hive.editor-status.v3',false],['hive.editor-status.v2',false],['hive.editor-status.v1',true]] as const){
    try{const raw=storage.getItem(key);if(!raw)continue;const data=JSON.parse(raw);
      if(key.endsWith('v3')&&data?.version===3&&Array.isArray(data.items))return normalizeStatusOptions(data);
      if(!key.endsWith('v3')&&Array.isArray(data))return normalizeStatusOptions(legacy?['save',...data]:data);
    }catch{/* Retain earlier preferences when the latest record is unreadable. */}
  }
  return normalizeStatusOptions(null);
}
export function placeStatusItem(items:StatusKey[],key:StatusKey,index=items.length):StatusKey[]{
  const next=normalizeStatus(items),old=next.indexOf(key);let target=Math.max(0,Math.min(next.length,Math.trunc(index)));
  if(old>=0){next.splice(old,1);if(old<target)target--;}
  next.splice(target,0,key);return next;
}
export function textStatistics(source:string){
  const {text,paragraphs}=markdownContent(source);
  let characters=0,pureCount=0;
  const whitespace=/\s/u,letterOrNumber=/[\p{L}\p{N}]/u;
  for(const character of text){if(!whitespace.test(character))characters++;if(letterOrNumber.test(character))pureCount++;}
  return {characters,pureCount,paragraphs};
}
const statisticsCache=new WeakMap<Text,ReturnType<typeof textStatistics>>();
export const cachedDocumentStatistics=(doc:Text)=>statisticsCache.get(doc);
export function cacheDocumentStatistics(doc:Text,value:ReturnType<typeof textStatistics>){statisticsCache.set(doc,value);}
export function documentStatistics(doc:Text){
  let value=statisticsCache.get(doc);if(!value){value=textStatistics(doc.toString());statisticsCache.set(doc,value);}return value;
}
