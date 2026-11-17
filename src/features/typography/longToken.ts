type Span={from:number;to:number;kind:'url'|'path'|'word'};

/** Conservative source-only candidates; normal English words are never styled. */
export function longTokenSpans(text:string,from:number,to:number):Span[]{
  const result:Span[]=[];
  for(const match of text.slice(from,to).matchAll(/[A-Za-z0-9:/?&=._%+#~@\\-]+/g)){
    const token=match[0].replace(/[.,:;!?]+$/,'');
    const isUrl=/^(?:https?:\/\/|www\.)/i.test(token)&&token.length>=24;
    const isPath=token.length>=24&&/[\\/]/.test(token)&&/[A-Za-z]/.test(token);
    // A length heuristic avoids measuring layout on every edit; keep it high so
    // ordinary words retain their normal letter spacing even in a narrow pane.
    const isLongWord=/^[A-Za-z]{64,}$/.test(token);
    if(isUrl||isPath||isLongWord)result.push({from:from+match.index!,to:from+match.index!+token.length,kind:isUrl?'url':isPath?'path':'word'});
  }
  return result;
}
