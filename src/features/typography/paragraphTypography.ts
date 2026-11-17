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
  const styles:ParagraphTypographyStyle[]=[];
  for(let number=first.number;number<=last.number;number++){
    const line=doc.line(number),classes:string[]=[];
    // CodeMirror renders source lines as separate blocks, so each needs its own
    // prose class for wrapped screen lines. Non-prose retains its existing styles.
    if(indentable)classes.push('cm-typography-prose');
    if(number===first.number)classes.push('cm-typography-paragraph-start',...(indentable?['cm-typography-indentable']:[]));
    if(number===last.number)classes.push('cm-typography-paragraph-end');
    if(classes.length)styles.push({from:line.from,to:line.from,line:true,className:classes.join(' ')});
  }
  return styles;
}
