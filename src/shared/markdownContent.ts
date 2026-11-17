import {frontmatterBlock} from './frontmatter';
import {GFM,parser as markdownParser} from '@lezer/markdown';
const countParser=markdownParser.configure(GFM);

// Shared source projection for writing limits and the editor's display statistics.
export function markdownContent(text: string) {
  const metadata=frontmatterBlock(text);if(metadata)text=text.slice(metadata.to);
  const hidden: { from: number; to: number }[] = [];
  let paragraphs=0;
  countParser.parse(text).iterate({
    enter(node) {
      if(node.name==='Paragraph'||node.name==='Task'||/^(ATX|Setext)Heading[1-6]$/.test(node.name)){
        let cursor=node.from,body='';
        for(let child=node.node.firstChild;child;child=child.nextSibling)if(child.name==='HeaderMark'||child.name==='TaskMarker'){body+=text.slice(cursor,child.from);cursor=child.to;}
        if((body+text.slice(cursor,node.to)).trim())paragraphs++;
      }
      if (
        /^(HeaderMark|EmphasisMark|StrikethroughMark|CodeMark|QuoteMark|ListMark|TaskMarker|TableDelimiter|LinkMark|LinkTitle|CodeInfo|HTMLTag)$/.test(
          node.name,
        ) ||
        (node.name === "URL" &&
          /^(Link|Image)$/.test(node.node.parent?.name || "")) ||
        (node.name === 'HTMLBlock' && /^(?:<div style="text-align: (?:left|center|right);">|<\/div>)$/.test(text.slice(node.from,node.to).trim()))
      )
        hidden.push({ from: node.from, to: node.to });
      if (node.name === "Escape")
        hidden.push({ from: node.from, to: node.from + 1 });
    },
  });
  let cursor = 0,
    visible = "";
  for (const range of hidden.sort((a, b) => a.from - b.from)) {
    if (range.from >= cursor) {
      visible += text.slice(cursor, range.from);
      cursor = range.to;
    }
  }
  visible += text.slice(cursor);
  return {text:visible,paragraphs};
}
