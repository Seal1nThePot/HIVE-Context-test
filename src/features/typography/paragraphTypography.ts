import type {SyntaxNode} from '@lezer/common';
import type {Text} from '@codemirror/state';

export type ParagraphTypographyStyle={from:number;to:number;line:true;className:string};
/** One semantic paragraph can contain many source lines and many wrapped screen lines. */
export function paragraphTypographyStyles(node:SyntaxNode,doc:Text):ParagraphTypographyStyle[]{
  if(node.name!=='Paragraph')return [];
  const first=doc.lineAt(node.from),last=doc.lineAt(Math.max(node.from,node.to-1));
  let indentable=true;
  for(let parent=node.parent;parent;parent=parent.parent)if(['ListItem','Blockquote','Table','HTMLBlock'].includes(parent.name)){indentable=false;break;}
  // Image-only blocks are display objects, not prose to indent.
  if(node.firstChild?.name==='Image'&&node.firstChild.from===node.from&&node.firstChild.to===node.to)indentable=false;
  const start='cm-typography-paragraph-start'+(indentable?' cm-typography-indentable':'');
  if(first.from===last.from)return [{from:first.from,to:first.from,line:true,className:start+' cm-typography-paragraph-end'}];
  return [{from:first.from,to:first.from,line:true,className:start},{from:last.from,to:last.from,line:true,className:'cm-typography-paragraph-end'}];
}
