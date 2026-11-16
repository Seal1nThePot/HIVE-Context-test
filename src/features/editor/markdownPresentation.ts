import {frontmatterBlock,maskFrontmatter} from '../../shared/frontmatter';
import {parser,GFM} from '@lezer/markdown';
import type {EditorState,Text} from '@codemirror/state';
import {inspectFormatting} from './formatting';

type Span={from:number;to:number};
type Node=ReturnType<typeof parser.parse>['topNode'];
export type PreviewCell=Span&{text:string;virtual?:number;trailing?:boolean};
export type PreviewReplacement=Span&{reveal:Span;block?:boolean;kind?:'bullet'|'task'|'image'|'rule'|'table'|'properties';text?:string;src?:string;rows?:PreviewCell[][];tableOrdinal?:number};
export type PreviewStyle=Span&{className?:string;line?:boolean;align?:'left'|'center'|'right';title?:string};
export type PreviewPlan={replacements:PreviewReplacement[];styles:PreviewStyle[]};
const markdownParser=parser.configure(GFM),cache=new WeakMap<Text,PreviewPlan>();
function children(node:Node,name?:string){const items:Node[]=[];for(let item=node.firstChild;item;item=item.nextSibling)if(!name||item.name===name)items.push(item);return items;}

export function previewPlan(state:EditorState):PreviewPlan{
  const existing=cache.get(state.doc);if(existing)return existing;
  let tableOrdinal=0;
  const doc=state.doc,text=doc.toString(),replacements:PreviewReplacement[]=[],styles:PreviewStyle[]=[];
  const hide=(from:number,to:number,reveal:Span={from,to},extra:Partial<PreviewReplacement>={})=>{if(to>from)replacements.push({from,to,reveal:{from:reveal.from,to:reveal.to},...extra});};
  const lineStyles=(from:number,to:number,className:string,align?:PreviewStyle['align'])=>{
    for(let number=doc.lineAt(from).number;number<=doc.lineAt(Math.max(from,to-1)).number;number++){const line=doc.line(number);styles.push({from:line.from,to:line.from,line:true,className,align});}
  };
  const hideLine=(pos:number,reveal?:Span)=>{const line=doc.lineAt(pos);hide(line.from,Math.min(doc.length,line.to+1),reveal||{from:line.from,to:line.to},{block:true});};
  function walk(node:Node){
    const parts=children(node),span={from:node.from,to:node.to};
    const heading=/^(?:ATX|Setext)Heading([1-6])$/.exec(node.name);
    if(heading){
      lineStyles(node.from,node.to,`cm-preview-h${heading[1]}`);
      for(const mark of children(node,'HeaderMark')){
        if(node.name.startsWith('Setext'))hideLine(mark.from,span);
        else {let end=mark.to;if(mark.from===node.from)while(end<node.to&&/[ \t]/.test(text[end]))end++;hide(mark.from,end,span);}
      }
    }
    if(node.name==='FencedCode'){
      const code=parts.find(item=>item.name==='CodeText');if(code)lineStyles(code.from,code.to,'cm-preview-code-line');
      for(const mark of parts.filter(item=>item.name==='CodeMark'))hideLine(mark.from);
      return;
    }
    if(node.name==='CodeBlock'){lineStyles(node.from,node.to,'cm-preview-code-line');return;}
    if(node.name==='InlineCode'){
      const marks=children(node,'CodeMark');if(marks.length===2){styles.push({from:marks[0].to,to:marks[1].from,className:'cm-preview-inline-code'});for(const mark of marks)hide(mark.from,mark.to,span);}return;
    }
    if(node.name==='Table'){
      const rows=parts.filter(item=>item.name==='TableHeader'||item.name==='TableRow').map(row=>{
        const cells:PreviewCell[]=[],delimiters=children(row,'TableDelimiter');let start=row.from;
        for(let index=0;index<delimiters.length;index++){const delimiter=delimiters[index];if(index||text.slice(start,delimiter.from).trim())cells.push({from:start,to:delimiter.from,text:text.slice(start,delimiter.from).trim()});start=delimiter.to;}
        if(start<row.to||!delimiters.length)cells.push({from:start,to:row.to,text:text.slice(start,row.to).trim()});
        return cells;
      });
      const columns=rows[0]?.length||0;for(const row of rows){while(row.length<columns){const rowNode=parts.filter(item=>item.name==='TableHeader'||item.name==='TableRow')[rows.indexOf(row)];row.push({from:rowNode.to,to:rowNode.to,text:'',virtual:row.length,trailing:text.slice(rowNode.from,rowNode.to).trimEnd().endsWith('|')});}if(row.length>columns)row.length=columns;}
      hide(node.from,node.to,span,{kind:'table',block:true,rows,tableOrdinal:tableOrdinal++});return;
    }
    if(node.name==='HorizontalRule'){hide(node.from,node.to,span,{kind:'rule',block:true});return;}
    if(node.name==='Blockquote')lineStyles(node.from,node.to,'cm-preview-quote');
    if(node.name==='StrongEmphasis'||node.name==='Emphasis'||node.name==='Strikethrough'){
      const marks=parts.filter(item=>item.name.endsWith('Mark'));
      if(marks.length>=2)styles.push({from:marks[0].to,to:marks.at(-1)!.from,className:node.name==='StrongEmphasis'?'cm-preview-strong':node.name==='Emphasis'?'cm-preview-emphasis':'cm-preview-strike'});
    }
    if(node.name==='EmphasisMark'||node.name==='StrikethroughMark'){hide(node.from,node.to,node.parent||span);return;}
    if(node.name==='ListMark'){
      const task=node.parent?.getChild('Task')?.getChild('TaskMarker');
      if(task)hide(node.from,task.from,node.parent||span);
      else hide(node.from,node.to,span,{kind:'bullet',text:/^\d/.test(text.slice(node.from,node.to))?text.slice(node.from,node.to):'•'});
      return;
    }
    if(node.name==='TaskMarker'){hide(node.from,node.to,span,{kind:'task',text:/[xX]/.test(text.slice(node.from,node.to))?'☑':'☐'});return;}
    if(node.name==='QuoteMark'){let to=node.to;if(text[to]===' ')to++;hide(node.from,to,span);return;}
    if(node.name==='Escape'){hide(node.from,node.from+1,span);return;}
    if(node.name==='Link'||node.name==='Image'){
      const first=parts.find(item=>item.name==='LinkMark'),end=parts.find(item=>item.name==='LinkMark'&&text.slice(item.from,item.to)===']');
      if(first&&end){
        const url=parts.find(item=>item.name==='URL');
        if(node.name==='Image'){hide(node.from,node.to,span,{kind:'image',text:text.slice(first.to,end.from).replace(/\\([\\[\]])/g,'$1')||'图片',src:url?text.slice(url.from,url.to):undefined});return;}
        styles.push({from:first.to,to:end.from,className:'cm-preview-link',title:url?text.slice(url.from,url.to):undefined});
        hide(node.from,first.to,span);hide(end.from,node.to,span);
        for(const part of parts)if(part.from>=first.to&&part.to<=end.from)walk(part);
        return;
      }
    }
    if(node.name==='Autolink'){
      styles.push({...span,className:'cm-preview-link'});for(const mark of children(node,'LinkMark'))hide(mark.from,mark.to,span);return;
    }
    if(node.name==='HTMLTag'){hide(node.from,node.to,span);return;}
    if(node.name==='HTMLBlock'){
      for(const match of text.slice(node.from,node.to).matchAll(/<\/?[a-zA-Z][^>\n]*>|<!--[\s\S]*?-->/g))hide(node.from+match.index,node.from+match.index+match[0].length,span);
      return;
    }
    if(node.name==='LinkReference'){hide(node.from,node.to,span,{block:true});return;}
    for(const part of parts)walk(part);
  }
  const metadata=frontmatterBlock(text);if(metadata)hide(metadata.from,metadata.to,{from:metadata.from,to:metadata.to},{kind:'properties',block:true,text:'笔记属性'});
  walk(markdownParser.parse(maskFrontmatter(text)).topNode);
  if(text.includes('<u>')||text.includes('<div style="text-align: ')){
    const {blocks,underlines}=inspectFormatting(state);
    for(const span of underlines)if(span.contentTo>span.contentFrom)styles.push({from:span.contentFrom,to:span.contentTo,className:'cm-format-underline'});
    for(const block of blocks){
      lineStyles(block.contentFrom,block.contentTo,'cm-preview-aligned',block.alignment);
      hide(block.from,block.contentFrom,{from:block.from,to:block.openTo},{block:true});
      const closing=doc.lineAt(block.closeFrom),previous=closing.number>1?doc.line(closing.number-1):closing;
      hide(previous.text.trim()?closing.from:previous.from,Math.min(doc.length,closing.to+1),{from:closing.from,to:closing.to},{block:true});
    }
  }
  const plan={replacements:replacements.filter(item=>!metadata||item.kind==='properties'||item.from>=metadata.to),styles:styles.filter(item=>!metadata||item.from>=metadata.to)};cache.set(doc,plan);return plan;
}

export function visibleReplacements(state:EditorState,focused:boolean){
  const active=focused?state.selection.ranges.map(range=>{
    const end=range.to>range.from&&state.doc.lineAt(range.to).from===range.to?range.to-1:range.to;
    return {from:state.doc.lineAt(range.from).from,to:state.doc.lineAt(end).to};
  }):[];
  const filtered=previewPlan(state).replacements.filter(item=>item.kind==='table'||!active.some(line=>item.reveal.from<=line.to&&item.reveal.to>line.from));
  const result:PreviewReplacement[]=[];
  for(const item of filtered.sort((a,b)=>a.from-b.from||b.to-a.to)){
    const previous=result.at(-1);if(previous&&item.from<previous.to){if(item.to>previous.to&&!previous.kind&&!item.kind)result[result.length-1]={...previous,to:item.to,block:previous.block||item.block};continue;}
    result.push(item);
  }
  return result;
}
