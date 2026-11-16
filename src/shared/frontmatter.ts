export type FrontmatterBlock={from:number;contentFrom:number;contentTo:number;to:number};

/** Only a delimited block at the start of a note is metadata. Offsets stay in source coordinates. */
export function frontmatterBlock(text:string):FrontmatterBlock|null {
  const from=text.startsWith('\uFEFF')?1:0,opening=/^---[ \t]*\r?\n/.exec(text.slice(from));
  if(!opening)return null;
  const contentFrom=from+opening[0].length,closing=/^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/gm;
  closing.lastIndex=contentFrom;const match=closing.exec(text);
  return match?{from,contentFrom,contentTo:match.index,to:match.index+match[0].length}:null;
}

export function maskFrontmatter(text:string){
  const block=frontmatterBlock(text);
  return block?text.slice(0,block.to).replace(/[^\r\n]/g,' ')+text.slice(block.to):text;
}
