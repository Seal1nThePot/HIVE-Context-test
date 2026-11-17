import {useEffect,useState} from 'react';
import {rangeProgressStyle} from '../settings/rangeProgress';

export default function ThemeColorField({label,value,onChange,alpha=false}:{label:string;value:string;onChange:(value:string)=>void;alpha?:boolean}){
  const [draft,setDraft]=useState(value),[editing,setEditing]=useState(false),[invalid,setInvalid]=useState(false);
  const allowAlpha=alpha||value.length===9,valid=(text:string)=>allowAlpha?/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text):/^#[0-9a-f]{6}$/i.test(text);
  useEffect(()=>{if(!editing)setDraft(value);},[value,editing]);
  const apply=(text:string)=>{setDraft(text);setInvalid(false);if(valid(text)&&text.toLowerCase()!==value)onChange(text.toLowerCase());};
  const opacity=value.length===9?Math.round(parseInt(value.slice(7),16)*100/255):100;
  return <span className="theme-color-field"><span className="theme-color-swatch" style={{backgroundColor:value}}><input type="color" aria-label={`${label}颜色选择`} value={value.slice(0,7)} onChange={event=>apply(event.target.value+(value.length===9?value.slice(7):''))}/></span><input type="text" aria-label={`${label}颜色值`} value={draft} maxLength={allowAlpha?9:7} spellCheck={false} aria-invalid={invalid} onFocus={()=>setEditing(true)} onChange={event=>apply(event.target.value)} onBlur={()=>{setEditing(false);if(!valid(draft)){setDraft(value);setInvalid(true);}else{setDraft(draft.toLowerCase());setInvalid(false);}}}/>{allowAlpha&&<label className="theme-color-opacity"><input type="range" aria-label={`${label}不透明度`} min={0} max={100} value={opacity} style={rangeProgressStyle(opacity,0,100)} onChange={event=>apply(value.slice(0,7)+Math.round(Number(event.target.value)*255/100).toString(16).padStart(2,'0'))}/><output>{opacity}%</output></label>}{invalid&&<small role="status">{allowAlpha?'请输入 #RRGGBB 或 #RRGGBBAA':'请输入 #RRGGBB'}</small>}</span>;
}
