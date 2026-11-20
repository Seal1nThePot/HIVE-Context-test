import { useLayoutEffect, useState } from "react";
import type {PanelLockGesture} from '../workspace/panelLockGesture';
import type {SplitOrder} from '../editor/splitView';

export type Appearance = { version: 1; uiScale: number; textScale: number; editorSize: number; ribbonVisible:boolean; ribbonCollapsed:boolean; floatingToolbarVisible:boolean; panelLockGesture:PanelLockGesture; splitOrder:SplitOrder };
const storageKey = 'hive.appearance.v1';
export const defaultAppearance: Appearance = {version:1,uiScale:100,textScale:100,editorSize:15,ribbonVisible:true,ribbonCollapsed:false,floatingToolbarVisible:true,panelLockGesture:'doubleClick',splitOrder:'source-first'};
function bounded(value: unknown, fallback: number, min: number, max: number) {
  return typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
}
function readAppearance(): Appearance {
  try {
    const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
    if(saved?.version!==1)return defaultAppearance;
    return {version:1,uiScale:bounded(saved.uiScale,100,80,150),textScale:bounded(saved.textScale,100,80,160),editorSize:bounded(saved.editorSize,15,10,36),ribbonVisible:typeof saved.ribbonVisible==='boolean'?saved.ribbonVisible:true,ribbonCollapsed:typeof saved.ribbonCollapsed==='boolean'?saved.ribbonCollapsed:false,floatingToolbarVisible:typeof saved.floatingToolbarVisible==='boolean'?saved.floatingToolbarVisible:true,panelLockGesture:saved.panelLockGesture==='longPress'?'longPress':'doubleClick',splitOrder:saved.splitOrder==='semantic-first'?'semantic-first':'source-first'};
  } catch {return defaultAppearance;}
}
export function useAppearance() {
  const [appearance,setAppearance]=useState(readAppearance),[saveError,setSaveError]=useState('');
  useLayoutEffect(()=>{
    // Upgrade an already-open development page as well as records read on startup.
    if(typeof appearance.ribbonVisible!=='boolean'||typeof appearance.ribbonCollapsed!=='boolean'||typeof appearance.floatingToolbarVisible!=='boolean'||!['doubleClick','longPress'].includes(appearance.panelLockGesture)||!['source-first','semantic-first'].includes(appearance.splitOrder)){
      setAppearance(old=>({...old,ribbonVisible:typeof old.ribbonVisible==='boolean'?old.ribbonVisible:true,ribbonCollapsed:typeof old.ribbonCollapsed==='boolean'?old.ribbonCollapsed:false,floatingToolbarVisible:typeof old.floatingToolbarVisible==='boolean'?old.floatingToolbarVisible:true,panelLockGesture:old.panelLockGesture==='longPress'?'longPress':'doubleClick',splitOrder:old.splitOrder==='semantic-first'?'semantic-first':'source-first'}));
      return;
    }
    const root=document.documentElement;
    root.style.setProperty('--ui-scale',String(appearance.uiScale/100));
    root.style.setProperty('--text-scale',String(appearance.textScale/100));
    root.style.setProperty('--editor-font-size',`${appearance.editorSize}px`);
    try {localStorage.setItem(storageKey,JSON.stringify(appearance));setSaveError('');}
    catch {setSaveError('当前浏览器无法保存外观设置，本次调整仍然生效。');}
  },[appearance]);
  return {appearance,setAppearance,saveError};
}
