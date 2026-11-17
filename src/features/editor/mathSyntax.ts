export type MathSpan={from:number;to:number;block:boolean;status?:string};
export type SourceSpan={from:number;to:number};
export const MAX_MATH_SOURCE=4096,MAX_MATH_LINES=64;

/** Remove dollar delimiters, preserving meaningful TeX whitespace such as a trailing \\ . */
export function mathSource(raw:string,block:boolean){
  const trimmed=raw.trim(),content=trimmed.slice(block?2:1,block?-2:-1);
  return block?content.replace(/^[ \t\r]*\n/,'').replace(/\r?\n[ \t]*$/,''):content;
}

function escaped(text:string,pos:number){let slashes=0;while(pos>0&&text[--pos]==='\\')slashes++;return slashes%2===1;}
function overlaps(spans:readonly SourceSpan[],from:number,to:number){
  let low=0,high=spans.length;
  while(low<high){const middle=(low+high)>>1;if(spans[middle].to<=from)low=middle+1;else high=middle;}
  return low<spans.length&&spans[low].from<to;
}
export function mergeSourceSpans(spans:readonly SourceSpan[]){
  const result:SourceSpan[]=[];
  for(const span of [...spans].sort((a,b)=>a.from-b.from||b.to-a.to)){
    const previous=result.at(-1);if(previous&&span.from<=previous.to)previous.to=Math.max(previous.to,span.to);else result.push({...span});
  }
  return result;
}

/** Dollar syntax is scanned once; the plan stores positions, never every TeX string. */
export function scanMath(text:string,excluded:readonly SourceSpan[]=[]){
  const exclusions=mergeSourceSpans(excluded),math:MathSpan[]=[],literal:SourceSpan[]=[];
  let open:{from:number;contentFrom:number;lines:number}|undefined;
  function add(from:number,to:number,contentFrom:number,contentTo:number,block:boolean,lines=1){
    const status=contentTo-contentFrom>MAX_MATH_SOURCE?'公式超过 4096 字符，显示源码':lines>MAX_MATH_LINES?'公式超过 64 行，显示源码':undefined;
    math.push({from,to,block,status});
  }
  for(let from=0;from<=text.length;){
    const newline=text.indexOf('\n',from),to=newline<0?text.length:newline;
    const line=text.slice(from,to),delimiter=/^ {0,3}\$\$/.exec(line);
    if(open){
      // Once a display opener owns the block, its contents are TeX, including any
      // Markdown-looking emphasis, links or backticks parsed by the GFM fallback.
      if(/^ {0,3}\$\$[ \t\r]*$/.test(line)){
        add(open.from,to,open.contentFrom,from,true,open.lines);open=undefined;
        if(newline<0)break;from=to+1;continue;
      }else open.lines++;
    }
    if(!open&&delimiter&&!overlaps(exclusions,from,from+delimiter[0].length)){
      const start=from+delimiter[0].length,tail=text.slice(start,to),closing=/\$\$[ \t\r]*$/.exec(tail);
      if(closing&&!escaped(text,start+closing.index)){
        if(tail.slice(0,closing.index).trim())add(from,to,start,start+closing.index,true);
      }else if(!tail.trim())open={from,contentFrom:to+1,lines:0};
      // A malformed display delimiter stays literal, including any Markdown inside it.
      else literal.push({from,to});
    }else if(!open){
      let cursor=from;
      while(cursor<to){
        const start=text.indexOf('$',cursor);if(start<0||start>=to)break;cursor=start+1;
        if(escaped(text,start)||/[A-Za-z0-9$]/.test(text[start-1]||'')||text[start+1]==='$'||/\s/.test(text[start+1]||' ')||overlaps(exclusions,start,start+1))continue;
        let end=start+1;
        while((end=text.indexOf('$',end))>=0&&end<to&&escaped(text,end))end++;
        if(end<0||end>=to)break;
        // Do not pair across code/URLs, dollar runs, whitespace or the next price ($5 and $10).
        if(text[end+1]==='$'||text[end-1]==='$'||/\s/.test(text[end-1])||/\d/.test(text[end+1]||'')||overlaps(exclusions,start,end+1)){cursor=end;continue;}
        if(/\d/.test(text[start+1])){
          const content=text.slice(start+1,end);
          if(!/^[\dA-Za-z.,]+$/.test(content)&&!/[=+\-*/^_\\<>]/.test(content)){cursor=end;continue;}
        }
        add(start,end+1,start+1,end,false);cursor=end+1;
      }
    }
    if(newline<0)break;from=to+1;
  }
  if(open)literal.push({from:open.from,to:text.length});
  return {math,literal};
}

/** Retain styling outside math while keeping every TeX character out of Markdown decoration. */
export function outsideMath<T extends SourceSpan>(span:T,protectedSpans:readonly SourceSpan[]):T[]{
  const result:T[]=[];let from=span.from;
  let low=0,high=protectedSpans.length;
  while(low<high){const middle=(low+high)>>1;if(protectedSpans[middle].to<=from)low=middle+1;else high=middle;}
  for(let index=low;index<protectedSpans.length;index++){
    const mask=protectedSpans[index];if(mask.from>=span.to)break;
    if(mask.from>from)result.push({...span,from,to:Math.min(span.to,mask.from)});
    from=Math.max(from,mask.to);if(from>=span.to)return result;
  }
  if(from<span.to)result.push({...span,from});return result;
}
