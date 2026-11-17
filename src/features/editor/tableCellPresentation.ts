import {parser,GFM} from '@lezer/markdown';
import type {SyntaxNode} from '@lezer/common';

const inlineParser=parser.configure(GFM);
/** Render only known inline nodes; all HTML except a literal br remains text. */
export function renderTableCell(target:HTMLElement,source:string){
  source='x '+source;
  const doc=target.ownerDocument,tree=inlineParser.parse(source),paragraph=tree.topNode.firstChild;
  target.replaceChildren();
  const text=(parent:Node,value:string)=>parent.appendChild(doc.createTextNode(value));
  const renderRange=(parent:Node,from:number,to:number,first:SyntaxNode|null)=>{
    let pos=from;
    for(let node=first;node&&node.from<to;node=node.nextSibling){
      if(node.from<from||node.to>to)continue;
      text(parent,source.slice(pos,node.from));renderNode(parent,node);pos=node.to;
    }
    text(parent,source.slice(pos,to));
  };
  const renderNode=(parent:Node,node:SyntaxNode)=>{
    const raw=source.slice(node.from,node.to),name=node.name;
    if(name==='Escape'){text(parent,raw.slice(1));return;}
    if(name==='Entity') {const decoder=doc.createElement('textarea');decoder.innerHTML=raw;text(parent,decoder.value);return;}
    if(name==='HTMLTag'&&/^<br\s*\/?\s*>$/i.test(raw)){parent.appendChild(doc.createElement('br'));return;}
    if(name==='InlineCode') {const marks=[node.firstChild,node.lastChild];if(marks[0]&&marks[1]){const el=doc.createElement('code');let value=source.slice(marks[0].to,marks[1].from).replace(/\n/g,' ');if(/^ .+ $/.test(value)&&/[^ ]/.test(value))value=value.slice(1,-1);text(el,value);parent.appendChild(el);return;}}
    const tag=name==='StrongEmphasis'?'strong':name==='Emphasis'?'em':name==='Strikethrough'?'del':null;
    if(tag){const first=node.firstChild,last=node.lastChild;if(first&&last){const el=doc.createElement(tag);renderRange(el,first.to,last.from,first.nextSibling);parent.appendChild(el);return;}}
    if(name==='Link'){const children:SyntaxNode[]=[];for(let child=node.firstChild;child;child=child.nextSibling)children.push(child);const close=children.find((n,i)=>i>0&&n.name==='LinkMark'),url=children.find(n=>n.name==='URL');if(close){const el=doc.createElement('a'),destination=url?source.slice(url.from,url.to):'';if(destination)el.dataset.hiveLink=destination;if(/^(https?:|mailto:)/i.test(destination)){el.href=destination;el.target='_blank';el.rel='noopener noreferrer';}renderRange(el,children[0].to,close.from,children[0].nextSibling);parent.appendChild(el);return;}}
    text(parent,raw);
  };
  if(paragraph?.name==='Paragraph')renderRange(target,2,source.length,paragraph.firstChild);else text(target,source.slice(2));
}
