import {EditorSelection, type EditorState, type TransactionSpec} from '@codemirror/state';
import {isolateHistory} from '@codemirror/commands';
import {markdownLanguage} from '@codemirror/lang-markdown';
import {frontmatterBlock} from '../../shared/frontmatter';

export type Alignment='left'|'center'|'right';
export type InlineFormat='bold'|'italic'|'underline'|'strike'|'inlineCode';
type Span={from:number;to:number;kind?:string};
export type AlignedBlock=Span & {openTo:number;closeFrom:number;contentFrom:number;contentTo:number;alignment:Alignment};
export type UnderlineSpan=Span & {contentFrom:number;contentTo:number};

// Inspect text only. HTML is never injected into the DOM or evaluated.
export function inspectFormatting(state:EditorState){
  const text=state.doc.toString(),excluded:Span[]=[],htmlBlocks:Span[]=[],underlines:UnderlineSpan[]=[],blocks:AlignedBlock[]=[];
  const metadata=frontmatterBlock(text);if(metadata)excluded.push({from:metadata.from,to:metadata.to,kind:'Frontmatter'});
  markdownLanguage.parser.parse(text).iterate({enter(node){
    if(/^(FencedCode|CodeBlock|InlineCode|Escape)$/.test(node.name)){
      excluded.push({from:node.from,to:node.to,kind:node.name});return false;
    }
    if(node.name==='HTMLBlock')htmlBlocks.push({from:node.from,to:node.to});
  }});
  const ignored=(from:number,to:number)=>excluded.some(span=>from<span.to&&to>span.from);
  const stack:number[]=[];
  for(const match of text.matchAll(/<u>|<\/u>/g)){
    const from=match.index,to=from+match[0].length;if(ignored(from,to))continue;
    if(match[0]==='<u>')stack.push(from);
    else {const start=stack.pop();if(start!==undefined)underlines.push({from:start,to,contentFrom:start+3,contentTo:from});}
  }
  const divs:({from:number;openTo:number;alignment:Alignment}|null)[]=[];
  for(let number=1;number<=state.doc.lines;number++){
    const line=state.doc.line(number);if(ignored(line.from,line.to))continue;
    const opening=/^<div style="text-align: (left|center|right);">$/.exec(line.text);
    if(opening){divs.push({from:line.from,openTo:line.to,alignment:opening[1] as Alignment});continue;}
    if(/^\s*<div(?:\s|>)/i.test(line.text)){divs.push(null);continue;}
    if(line.text!=='</div>')continue;
    const open=divs.pop();if(!open)continue;
    let contentFrom=open.openTo+1,contentTo=line.from-1;
    if(text[contentFrom]==='\n')contentFrom++;
    if(contentTo>contentFrom&&text[contentTo-1]==='\n')contentTo--;
    blocks.push({...open,to:line.to,closeFrom:line.from,contentFrom,contentTo:Math.max(contentFrom,contentTo)});
  }
  return {blocks,underlines,excluded,htmlBlocks};
}

const tokens:Record<InlineFormat,[string,string]>={bold:['**','**'],italic:['*','*'],underline:['<u>','</u>'],strike:['~~','~~'],inlineCode:['`','`']};
const historyBoundary={annotations:isolateHistory.of('full'),userEvent:'input.format',scrollIntoView:true};
function checkEditable(state:EditorState){if(state.readOnly)throw new Error('当前编辑区只读。');}

export function inlineFormatting(state:EditorState,format:InlineFormat):TransactionSpec{
  checkEditable(state);
  const {excluded,underlines}=inspectFormatting(state),[open,close]=tokens[format];
  for(const range of state.selection.ranges)if(excluded.some(span=>(format!=='inlineCode'||span.kind!=='InlineCode')&&(range.empty?range.from>=span.from&&range.from<span.to:range.from<span.to&&range.to>span.from)))throw new Error('请在代码区域之外使用文字格式。');
  if(format==='inlineCode')return {...state.changeByRange(range=>{
    const existing=excluded.find(span=>span.kind==='InlineCode'&&range.from>=span.from&&range.to<=span.to);
    if(existing){
      const source=state.sliceDoc(existing.from,existing.to),length=source.match(/^`+/)![0].length,inner=source.slice(length,-length),padding=inner.startsWith(' ')&&inner.endsWith(' ')&&!!inner.trim()?1:0;
      const start=existing.from+length+padding,end=existing.to-length-padding;
      const mapped=(pos:number)=>existing.from+Math.max(0,Math.min(end-start,pos-start));
      return {changes:[{from:existing.from,to:start,insert:''},{from:end,to:existing.to,insert:''}],range:EditorSelection.range(mapped(range.anchor),mapped(range.head))};
    }
    const selected=state.sliceDoc(range.from,range.to);if(selected.includes('\n'))throw new Error('行内代码请选择同一行的文字。');
    const delimiter='`'.repeat(Math.max(1,...(selected.match(/`+/g)||[]).map(run=>run.length+1))),padding=selected.startsWith('`')||selected.endsWith('`')?' ':'';
    const insert=delimiter+padding+selected+padding+delimiter,start=range.from+delimiter.length+padding.length,end=start+selected.length;
    return {changes:{from:range.from,to:range.to,insert},range:EditorSelection.range(range.anchor<=range.head?start:end,range.anchor<=range.head?end:start)};
  }),...historyBoundary};
  // A cursor inside an underline removes its matching pair, rather than creating nested empty tags.
  if(format==='underline'&&state.selection.ranges.length===1&&state.selection.main.empty){
    const pos=state.selection.main.from,span=underlines.filter(item=>pos>=item.contentFrom&&pos<=item.contentTo).sort((a,b)=>(a.to-a.from)-(b.to-b.from))[0];
    if(span)return {...historyBoundary,changes:[{from:span.from,to:span.contentFrom,insert:''},{from:span.contentTo,to:span.to,insert:''}],selection:EditorSelection.cursor(pos-3)};
  }
  const spec=state.changeByRange(range=>{
    const selected=state.sliceDoc(range.from,range.to);
    if(!range.empty&&!selected.trim())return {range};
    const enclosed=state.sliceDoc(Math.max(0,range.from-open.length),range.from)===open&&state.sliceDoc(range.to,range.to+close.length)===close;
    const direction=(from:number,to:number)=>EditorSelection.range(range.anchor<=range.head?from:to,range.anchor<=range.head?to:from);
    if(enclosed)return {changes:[{from:range.from-open.length,to:range.from,insert:''},{from:range.to,to:range.to+close.length,insert:''}],range:direction(range.from-open.length,range.to-open.length)};
    const lines=selected.split('\n'),remove=!!selected&&lines.filter(line=>line.trim()).every(line=>{const core=line.trim();return core.startsWith(open)&&core.endsWith(close)&&core.length>=open.length+close.length;});
    const insert=range.empty?open+close:lines.map(line=>{
      if(!line.trim())return line;
      const leading=line.match(/^\s*/)?.[0]||'',trailing=line.match(/\s*$/)?.[0]||'',core=line.trim();
      return leading+(remove?core.slice(open.length,-close.length):open+core+close)+trailing;
    }).join('\n');
    const multi=lines.length>1||selected!==selected.trim(),start=range.from+(remove||multi?0:open.length),end=range.from+insert.length-(remove||multi?0:close.length);
    return {changes:{from:range.from,to:range.to,insert},range:range.empty?EditorSelection.cursor(start):direction(start,Math.max(start,end))};
  });
  return {...spec,...historyBoundary};
}

function paragraphBounds(state:EditorState){
  const range=state.selection.main,doc=state.doc;
  let first=doc.lineAt(range.from).number,last=doc.lineAt(range.to>range.from&&doc.lineAt(range.to).from===range.to?range.to-1:range.to).number;
  const boundary=(line:string)=>!line.trim()||/^\s*(?:#{1,6}\s|<\/?div\b|[-*_]{3,}\s*$)/.test(line);
  if(!boundary(doc.line(first).text))while(first>1&&!boundary(doc.line(first-1).text))first--;
  if(!boundary(doc.line(last).text))while(last<doc.lines&&!boundary(doc.line(last+1).text))last++;
  return {from:doc.line(first).from,to:doc.line(last).to};
}

export function paragraphAlignment(state:EditorState,alignment:Alignment):TransactionSpec{
  checkEditable(state);
  if(state.selection.ranges.length!==1)throw new Error('请使用一个连续选区设置段落对齐。');
  const {blocks,excluded,htmlBlocks}=inspectFormatting(state),range=state.selection.main;
  const current=blocks.filter(block=>range.from>=block.from&&range.to<=block.to).sort((a,b)=>(a.to-a.from)-(b.to-b.from))[0];
  let changes:NonNullable<TransactionSpec['changes']>,selection:TransactionSpec['selection'];
  if(current){
    if(current.alignment===alignment)return {};
    // An explicit left choice needs a wrapper too: ordinary live prose is justified.
    changes={from:current.from,to:current.openTo,insert:`<div style="text-align: ${alignment};">`};
  }else{
    const span=paragraphBounds(state);
    if(excluded.some(code=>span.from<code.to&&span.to>code.from)||/^ {4}|^\t/m.test(state.sliceDoc(span.from,span.to)))throw new Error('请在代码区域之外设置段落对齐。');
    if(blocks.some(block=>span.from<block.to&&span.to>block.from)||/<\/?div\b/i.test(state.sliceDoc(span.from,span.to)))throw new Error('选区跨越了已有排版区域，请分别调整各区域。');
    if(htmlBlocks.some(block=>span.from<block.to&&span.to>block.from))throw new Error('请在已有 HTML 排版区域之外调整段落。');
    const before=span.from>0&&!/^\s*$/.test(state.doc.lineAt(span.from-1).text)?'\n':'';
    const after=span.to<state.doc.length&&!/^\s*$/.test(state.doc.lineAt(span.to+1).text)?'\n':'';
    const prefix=`${before}<div style="text-align: ${alignment};">\n\n`;
    changes=[{from:span.from,insert:prefix},{from:span.to,insert:`\n\n</div>${after}`}];
    selection=EditorSelection.range(range.anchor+prefix.length,range.head+prefix.length);
  }
  const set=state.changes(changes);
  return {...historyBoundary,changes:set,selection:selection||state.selection.map(set)};
}

export function lineFormatting(state:EditorState,kind:'bullet'|'numbered'|'quote'|'task'|0|1|2|3|4):TransactionSpec{
  checkEditable(state);
  const selected=new Set<number>();
  for(const range of state.selection.ranges){
    const end=range.to>range.from&&state.doc.lineAt(range.to).from===range.to?range.to-1:range.to;
    for(let number=state.doc.lineAt(range.from).number;number<=state.doc.lineAt(end).number;number++)selected.add(number);
  }
  const lines=[...selected].map(number=>state.doc.line(number)),{excluded}=inspectFormatting(state);
  if(lines.some(line=>excluded.some(code=>line.from<code.to&&line.to>code.from)||/^<\/?div\b/.test(line.text)))throw new Error('请在代码或排版标记之外使用段落格式。');
  const pattern=typeof kind==='number'?/^#{1,6}\s+/:kind==='quote'?/^>\s?/:/^(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/;
  const remove=typeof kind!=='number'&&lines.every(line=>kind==='quote'?/^>\s?/.test(line.text):kind==='task'?/^[-+*]\s+\[[ xX]\]\s+/.test(line.text):kind==='bullet'?/^[-+*]\s+/.test(line.text):/^\d+[.)]\s+/.test(line.text));
  const changes=lines.map((line,index)=>{
    const prefix=typeof kind==='number'?'#'.repeat(kind)+(kind?' ':''):kind==='quote'?'> ':kind==='task'?'- [ ] ':kind==='bullet'?'- ':`${index+1}. `;
    const match=pattern.exec(line.text);
    return {from:line.from,to:line.from+(match?.[0].length||0),insert:remove?'':prefix};
  });
  const set=state.changes(changes);
  return {...historyBoundary,changes:set,selection:state.selection.map(set)};
}

export function insertStructure(state:EditorState,kind:'codeBlock'|'link'|'rule'):TransactionSpec{
  checkEditable(state);const range=state.selection.main;
  if(state.selection.ranges.length!==1)throw new Error('请使用一个连续选区插入结构。');
  const {excluded}=inspectFormatting(state);
  if(excluded.some(span=>range.from>=span.from&&range.from<span.to&&span.kind!=='InlineCode'))throw new Error('请在代码区域之外插入结构。');
  if(kind==='link'){
    const label=state.sliceDoc(range.from,range.to)||'链接文字';if(label.includes('\n'))throw new Error('请选择一行内的文字添加链接。');
    const escaped=label.replace(/[\\[\]]/g,'\\$&'),insert=`[${escaped}](https://)`,start=range.from+escaped.length+3;
    return {...historyBoundary,changes:{from:range.from,to:range.to,insert},selection:EditorSelection.range(start,start+8)};
  }
  if(kind==='rule')return {...historyBoundary,changes:{from:range.to,insert:'\n\n---\n\n'},selection:EditorSelection.cursor(range.to+7)};
  const first=state.doc.lineAt(range.from),last=state.doc.lineAt(range.to>range.from&&state.doc.lineAt(range.to).from===range.to?range.to-1:range.to);
  const content=state.sliceDoc(first.from,last.to),runs=content.match(/`+/g)||[],fence='`'.repeat(Math.max(3,...runs.map(run=>run.length+1)));
  const before=first.from>0&&state.doc.line(first.number-1).text.trim()?'\n':'',after=last.to<state.doc.length&&state.doc.line(last.number+1).text.trim()?'\n':'';
  const prefix=before+fence+'\n',suffix='\n'+fence+after;
  return {...historyBoundary,changes:[{from:first.from,insert:prefix},{from:last.to,insert:suffix}],selection:EditorSelection.range(range.anchor+prefix.length,range.head+prefix.length)};
}
