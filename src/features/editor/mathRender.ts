import katex from 'katex';
import {MAX_MATH_SOURCE,MAX_MATH_LINES} from './mathSyntax';

export type MathResult={html:string;error?:never}|{html?:never;error:string};
export const MAX_MATH_HTML=131072;
export function renderMath(source:string,displayMode:boolean):MathResult{
  if(source.length>MAX_MATH_SOURCE)return {error:'公式超过 4096 字符，显示源码'};
  if(source.split('\n').length>MAX_MATH_LINES)return {error:'公式超过 64 行，显示源码'};
  if(/\\(?:href|url|includegraphics|htmlClass|htmlId|htmlStyle|htmlData)(?![A-Za-z])/.test(source))return {error:'公式包含外链或 HTML 指令，显示源码'};
  let depth=0;
  for(let index=0;index<source.length;index++){
    if(source[index]==='\\'){index++;continue;}
    if(source[index]==='{'){if(++depth>64)return {error:'公式嵌套过深，显示源码'};}else if(source[index]==='}')depth--;
  }
  try{
    const html=katex.renderToString(source,{displayMode,output:'htmlAndMathml',throwOnError:true,trust:false,strict:'error',maxSize:20,maxExpand:256,macros:Object.create(null),globalGroup:false});
    return html.length<=MAX_MATH_HTML?{html}:{error:'公式显示结果过大，显示源码'};
  }catch{return {error:'公式无效或不受支持，显示源码'};}
}
