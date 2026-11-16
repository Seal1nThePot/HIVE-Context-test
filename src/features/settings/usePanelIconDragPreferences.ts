import {useEffect,useState} from 'react';

export type PanelIconHoldStyle='circle'|'bar';
export type PanelIconDragPreferences={version:1;holdStyle:PanelIconHoldStyle;holdDelayMs:number;minimumTriggerMs:number};
const key='hive.panelIconDragPreferences.v1';
export const defaultPanelIconDragPreferences:PanelIconDragPreferences={version:1,holdStyle:'circle',holdDelayMs:1000,minimumTriggerMs:200};
export function readPanelIconDragPreferences(raw:string|null):PanelIconDragPreferences{
  try{const value=JSON.parse(raw||'null');return value?.version===1&&(value.holdStyle==='circle'||value.holdStyle==='bar')?{version:1,holdStyle:value.holdStyle,holdDelayMs:typeof value.holdDelayMs==='number'&&Number.isFinite(value.holdDelayMs)&&value.holdDelayMs>=50&&value.holdDelayMs<=3000?Math.round(value.holdDelayMs):1000,minimumTriggerMs:typeof value.minimumTriggerMs==='number'&&Number.isFinite(value.minimumTriggerMs)&&value.minimumTriggerMs>=50&&value.minimumTriggerMs<=3000?Math.round(value.minimumTriggerMs):200}:defaultPanelIconDragPreferences;}catch{return defaultPanelIconDragPreferences;}
}
export function usePanelIconDragPreferences(){
  const [preferences,setPreferences]=useState(()=>{try{return readPanelIconDragPreferences(localStorage.getItem(key));}catch{return defaultPanelIconDragPreferences;}}),[saveError,setSaveError]=useState('');
  useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(preferences));setSaveError('');}catch{setSaveError('图标拖动偏好暂时无法保存，本次选择仍然生效。');}},[preferences]);
  return {preferences,setPreferences,saveError};
}
