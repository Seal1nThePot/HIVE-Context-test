import {useSyncExternalStore} from 'react';
const key='hive.frontmatter-visible.v1';
let value:boolean|undefined;
let error='';
const listeners=new Set<()=>void>();
export function frontmatterVisible(){if(value===undefined){try{value=localStorage.getItem(key)!=='false';}catch{value=true;}}return value;}
export function subscribeFrontmatterVisibility(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function setFrontmatterVisible(next:boolean){value=next;try{localStorage.setItem(key,String(next));error='';}catch{error='无法保存显示设置，本次调整仍然生效。';}listeners.forEach(listener=>listener());}
export function useFrontmatterVisibility(){const visible=useSyncExternalStore(subscribeFrontmatterVisibility,frontmatterVisible,()=>true);return {visible,setVisible:setFrontmatterVisible,error};}
