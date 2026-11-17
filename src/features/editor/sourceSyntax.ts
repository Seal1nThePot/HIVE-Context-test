import {Language} from '@codemirror/language';
import {markdownLanguage} from '@codemirror/lang-markdown';
import {NodeProp} from '@lezer/common';
import {Table,type MarkdownConfig,type MarkdownParser} from '@lezer/markdown';

export const compactSourceThreshold=100000;
const compactMode=new NodeProp<boolean>();
function pipes(text:string){let count=0;for(let i=0;i<text.length;i++){if(text[i]==='\\')i++;else if(text[i]==='|')count++;}return count;}
function wrapped(text:string){const value=text.trim();let escapes=0;for(let i=value.length-2;i>=0&&value[i]==='\\';i--)escapes++;return value.startsWith('|')&&value.endsWith('|')&&escapes%2===0&&pipes(value)>1;}

/** Only the duplicate source-colouring tree is compacted. The live preview and source
 * editing model continue to use the complete GFM table and exact source coordinates. */
const tableFactory=Table.parseBlock![0].leaf!;
const compactTables:MarkdownConfig={parseBlock:[{
  name:'Table',
  leaf(cx,leaf){
    const parser=tableFactory(cx,leaf);
    if(!parser||cx.depth!==1||!wrapped(leaf.content))return parser;
    const next=parser.nextLine.bind(parser),finish=parser.finish.bind(parser);
    let first=true,compact=false,delegate=false;
    // Retain the library's own parser instance. Its paragraph-interruption rules
    // recognize this instance, so bare rows, Setext text and following blocks keep
    // exactly the same table boundaries as GFM. Only child-node construction differs.
    parser.nextLine=(context,line,block)=>{
      if(first){
        first=false;const separator=line.text.slice(line.pos).trim();
        compact=/^\|(?:[ \t]*:?-+:?[ \t]*\|)+[ \t]*$/.test(separator)&&pipes(block.content)===pipes(separator);
        delegate=!compact;
      }
      return delegate?next(context,line,block):false;
    };
    parser.finish=(context,block)=>{
      if(!compact)return finish(context,block);
      context.addLeafElement(block,context.elt('Table',block.start,block.start+block.content.length));return true;
    };
    return parser;
  },
}]};

const original=markdownLanguage.parser as MarkdownParser;
const full=original.configure({props:[compactMode.add(type=>type.name==='Document'?false:undefined)]});
const compact=original.configure([compactTables,{props:[compactMode.add(type=>type.name==='Document'?true:undefined)]}]);
const adaptive=full.configure({wrap(inner,input,fragments,ranges){
  const mode=input.length>compactSourceThreshold;
  const compatible=fragments.filter(fragment=>fragment.tree.type.prop(compactMode)===mode);
  // Do not reuse a compact colouring tree when a note shrinks below the threshold.
  return mode?compact.startParse(input,compatible,ranges):compatible.length===fragments.length?inner:full.startParse(input,compatible,ranges);
}});
export const outlineMarkdownParser=adaptive;
export const sourceMarkdownLanguage=new Language(markdownLanguage.data,adaptive,[],'markdown');
