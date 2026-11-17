import type {Text} from '@codemirror/state';
export type FrontmatterBlock={from:number;contentFrom:number;contentTo:number;to:number};

const documentBlocks=new WeakMap<Text,FrontmatterBlock|null>();
/** Inspect only the metadata prefix; ordinary notes do not need a whole-document string. */
export function documentFrontmatter(doc:Text):FrontmatterBlock|null {
  if(documentBlocks.has(doc))return documentBlocks.get(doc)!;
  const first=doc.line(1),from=first.text.startsWith('\uFEFF')?1:0;
  let block:FrontmatterBlock|null=null;
  if(doc.lines>1&&/^---[ \t]*\r?$/.test(first.text.slice(from))){
    const contentFrom=first.to+1,cursor=doc.iterLines(2);let pos=contentFrom;
    while(!cursor.next().done){const line=cursor.value;if(/^(?:---|\.\.\.)[ \t]*\r?$/.test(line)){block={from,contentFrom,contentTo:pos,to:Math.min(doc.length,pos+line.length+1)};break;}pos+=line.length+1;}
  }
  documentBlocks.set(doc,block);return block;
}

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
