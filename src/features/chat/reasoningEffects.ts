import type {ReasoningLevel} from '../settings/modelConfig';
export type ReasoningEffect={color?:string;glow:number;particles:number;duration:number;easing:string};
export type ReasoningEffects=Partial<Record<ReasoningLevel,ReasoningEffect>>;
const levels:ReasoningLevel[]=['off','minimal','low','medium','high','xhigh','max'];
export function normalizeReasoningEffects(value:unknown):ReasoningEffects {
  const raw=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  const output:ReasoningEffects={};
  levels.forEach((level,index)=>{const entry=raw[level];if(!entry||typeof entry!=='object'||Array.isArray(entry))return;const v=entry as Record<string,unknown>;const number=(x:unknown,fallback:number,min:number,max:number)=>typeof x==='number'&&Number.isFinite(x)?Math.max(min,Math.min(max,x)):fallback;output[level]={color:typeof v.color==='string'&&/^#[0-9a-f]{6}$/i.test(v.color)?v.color:undefined,glow:number(v.glow,(index+1)/7,0,1),particles:Math.round(number(v.particles,index,0,8)),duration:Math.round(number(v.duration,350,0,2000)),easing:typeof v.easing==='string'&&/^cubic-bezier\(\s*(?:0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s*,\s*-?\d+(?:\.\d+)?\s*,\s*(?:0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s*,\s*-?\d+(?:\.\d+)?\s*\)$/.test(v.easing)?v.easing:'cubic-bezier(.22,1,.36,1)'};});return output;
}
