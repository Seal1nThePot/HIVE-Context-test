import type {CSSProperties} from 'react';

/** Keep the painted portion in step with the controlled native range value. */
export function rangeProgressStyle(value:number,min:number,max:number):CSSProperties {
  const progress=max>min?Math.max(0,Math.min(100,(value-min)/(max-min)*100)):0;
  return {'--range-progress':`${progress}%`} as CSSProperties;
}
