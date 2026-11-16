import {EditorSelection,type EditorState,type TransactionSpec} from '@codemirror/state';
import {isolateHistory} from '@codemirror/commands';
import {inspectFormatting} from './formatting';

function blockInsertion(state:EditorState,text:string,select?:{from:number;to:number}):TransactionSpec{
  if(state.readOnly)throw new Error('当前编辑区只读。');
  if(state.selection.ranges.length!==1)throw new Error('请使用一个光标或连续选区插入内容。');
  const at=state.selection.main.to;
  if(inspectFormatting(state).excluded.some(span=>at>=span.from&&at<span.to))throw new Error('请在代码区域之外插入图片或表格。');
  const before=state.sliceDoc(0,at),after=state.sliceDoc(at);
  const prefix=!before||before.endsWith('\n\n')?'':before.endsWith('\n')?'\n':'\n\n';
  const suffix=after.startsWith('\n\n')?'':after.startsWith('\n')?'\n':'\n\n',from=at+prefix.length;
  return {changes:{from:at,insert:prefix+text+suffix},selection:select?EditorSelection.range(from+select.from,from+select.to):EditorSelection.cursor(from+text.length+suffix.length),annotations:isolateHistory.of('full'),userEvent:'input.insert',scrollIntoView:true};
}
export function imageMarkdown(reference:string,name:string){
  if(!reference||/^(?:[a-z][a-z\d+.-]*:|[\\/])/i.test(reference))throw new Error('请使用图片的相对路径。');
  const alt=(name.replace(/\.[^.]+$/,'')||'图片').replace(/[\r\n]+/g,' ').replace(/[\\[\]]/g,'\\$&');
  return `![${alt}](${reference.split('/').map(encodeURIComponent).join('/')})`;
}
export function insertImage(state:EditorState,reference:string,name:string){return blockInsertion(state,imageMarkdown(reference,name));}
export function insertTable(state:EditorState,rows:number,columns:number){
  if(!Number.isInteger(rows)||rows<1||rows>20||!Number.isInteger(columns)||columns<1||columns>12)throw new Error('表格支持 1–20 行正文、1–12 列。');
  const row=(cells:string[])=>'| '+cells.join(' | ')+' |';
  const header=Array.from({length:columns},(_,index)=>`标题 ${index+1}`),body=Array.from({length:rows},()=>row(Array(columns).fill('')));
  return blockInsertion(state,[row(header),row(Array(columns).fill('---')),...body].join('\n'),{from:2,to:2+header[0].length});
}
export type ImageContext={file:string;workspace:string};
export function localImageUrl(source:string,context:ImageContext|null){
  if(!context?.file||!context.workspace||!source)return null;
  const value=source.replace(/^<|>$/g,'');
  if(/^(?:[a-z][a-z\d+.-]*:|[\\/])/i.test(value))return null;
  return '/api/images?'+new URLSearchParams({workspace:context.workspace,document:context.file,path:value});
}
