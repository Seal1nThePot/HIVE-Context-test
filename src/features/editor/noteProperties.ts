import {Document,isMap,isScalar,isSeq,parseDocument,Scalar,type Node,type Pair} from 'yaml';
import {EditorSelection,type EditorState,type TransactionSpec} from '@codemirror/state';
import {isolateHistory} from '@codemirror/commands';
import {frontmatterBlock} from '../../shared/frontmatter';

export type PropertyType='text'|'number'|'boolean'|'list'|'date'|'datetime'|'yaml';
export type NoteProperty={id:string;key:string;type:PropertyType;value:string;original?:number};
const timestampTag='tag:yaml.org,2002:timestamp';
// Keep the entered calendar date, time and offset intact instead of converting through Date/UTC.
const yamlOptions={stringKeys:true,uniqueKeys:true,prettyErrors:false,logLevel:'silent' as const,customTags:[{tag:timestampTag,default:false,resolve:(value:string)=>value,stringify:(item:Scalar)=>JSON.stringify(String(item.value))}]};
const MAX_PROPERTIES=64,MAX_YAML=65536;
function readDocument(source:string){
  const block=frontmatterBlock(source),raw=block?source.slice(block.contentFrom,block.contentTo):'';
  if(raw.length>MAX_YAML)throw new Error('笔记属性超过 64 KB，请在源码模式中编辑。');
  const doc:Document=parseDocument(raw,yamlOptions) as Document;
  if(doc.errors.length)throw new Error('现有笔记属性的 YAML 格式有误，请先在源码模式中修复：'+doc.errors[0].message);
  if(doc.contents!==null&&!isMap(doc.contents))throw new Error('笔记属性需要是“属性名: 值”的格式，请在源码模式中修复。');
  if(isMap(doc.contents)&&doc.contents.items.length>MAX_PROPERTIES)throw new Error('属性超过 64 项，请在源码模式中编辑。');
  return {block,doc};
}
function yamlValue(node:Node|null){const doc=new Document();doc.contents=node?node.clone() as Node:null;return doc.toString({lineWidth:0,verifyAliasOrder:false}).trimEnd();}
function propertyValue(node:Node|null):Pick<NoteProperty,'type'|'value'> {
  if(isScalar(node)){
    if(node.tag===timestampTag&&typeof node.value==='string')return {type:/^\d{4}-\d{2}-\d{2}$/.test(node.value)?'date':'datetime',value:node.value};
    if(typeof node.value==='string')return {type:'text',value:node.value};
    if(typeof node.value==='number'&&Number.isFinite(node.value))return {type:'number',value:String(node.value)};
    if(typeof node.value==='boolean')return {type:'boolean',value:String(node.value)};
  }
  if(isSeq(node)&&node.items.every(item=>isScalar(item)&&typeof item.value==='string'&&!item.value.includes('\n')&&item.value!==''))return {type:'list',value:node.items.map(item=>(item as Scalar<string>).value).join('\n')};
  return {type:'yaml',value:yamlValue(node)};
}
export function readNoteProperties(source:string):NoteProperty[]{
  const {doc}=readDocument(source);
  return isMap(doc.contents)?doc.contents.items.map((pair,index)=>({id:'original:'+index,key:String((pair.key as Scalar).value),original:index,...propertyValue(pair.value as Node|null)})):[];
}
function makeValue(row:NoteProperty,doc:Document):Node|null {
  if(row.value.length>MAX_YAML)throw new Error('属性值过长，请在源码模式中编辑。');
  if(row.type==='text')return doc.createNode(row.value);
  if(row.type==='date'||row.type==='datetime'){
    const value=row.value.trim(),date=value.slice(0,10),parsed=new Date(date+'T00:00:00Z');
    const validDate=/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date;
    const time=/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/;
    if(!validDate||(row.type==='date'?value!==date:!time.test(value)))throw new Error('“'+row.key+'”需要填写有效'+(row.type==='date'?'日期（YYYY-MM-DD）。':'日期与时间（如 2026-11-16T15:30:00）。'));
    const node=new Scalar(value);node.tag=timestampTag;return node;
  }
  if(row.type==='number'){
    if(!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(row.value.trim())||!Number.isFinite(Number(row.value)))throw new Error('“'+row.key+'”需要填写有效数字。');
    return doc.createNode(Number(row.value));
  }
  if(row.type==='boolean'){
    if(!['true','false'].includes(row.value))throw new Error('“'+row.key+'”需要选择是或否。');
    return doc.createNode(row.value==='true');
  }
  if(row.type==='list')return doc.createNode(row.value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean));
  const value=parseDocument(row.value,yamlOptions);
  if(value.errors.length)throw new Error('“'+row.key+'”的 YAML 值无效：'+value.errors[0].message);
  return value.contents?value.contents.clone() as Node:null;
}
export function notePropertiesChange(source:string,rows:NoteProperty[]):{from:number;to:number;insert:string}|null {
  const {block,doc}=readDocument(source),original=readNoteProperties(source),names=new Set<string>();
  const fields=rows.filter(row=>row.key.trim()||row.value.trim());
  if(fields.length>MAX_PROPERTIES)throw new Error('最多支持 64 项笔记属性。');
  const pairs=isMap(doc.contents)?doc.contents.items:[],next:Pair[]=[];
  for(const row of fields){
    const key=row.key.trim();if(!key||key.length>100||/[\r\n]/.test(key))throw new Error('请填写 1–100 字、单行的属性名称。');
    if(names.has(key))throw new Error('属性名“'+key+'”重复了。');names.add(key);
    const previous=row.original===undefined?undefined:original[row.original],pair=row.original===undefined?undefined:pairs[row.original];
    if(pair&&previous){
      if(key!==previous.key){const scalar=pair.key as Scalar;scalar.value=key;}
      if(row.type!==previous.type||row.value!==previous.value){
        const oldValue=pair.value as Node|null,value=makeValue({...row,key},doc);
        if(value&&oldValue){value.comment=oldValue.comment;value.commentBefore=oldValue.commentBefore;value.spaceBefore=oldValue.spaceBefore;const anchor='anchor' in oldValue?oldValue.anchor:undefined;if(anchor&&(isScalar(value)||isMap(value)||isSeq(value)))value.anchor=anchor;}
        pair.value=value;
      }
      next.push(pair);
    }else next.push(doc.createPair(key,makeValue({...row,key},doc)));
  }
  if(fields.length===original.length&&fields.every((row,index)=>row.original===index&&row.key.trim()===original[index].key&&row.type===original[index].type&&row.value===original[index].value))return null;
  const from=block?.from??(source.startsWith('\uFEFF')?1:0),to=block?.to??from;
  if(!fields.length)return block?{from,to,insert:''}:null;
  if(!isMap(doc.contents))doc.contents=doc.createNode({});
  if(!isMap(doc.contents))throw new Error('无法建立笔记属性。');doc.contents.items=next;
  try{doc.toJS({maxAliasCount:100,mapAsMap:true});}catch{throw new Error('属性中的 YAML 引用无效或过多，请在源码模式中检查锚点。');}
  const yaml=doc.toString({lineWidth:0});if(yaml.length>MAX_YAML)throw new Error('笔记属性超过 64 KB，请减少属性内容。');
  const newline=source.includes('\r\n')?'\r\n':'\n',closing=block&&source.slice(block.contentTo,block.to).trim().startsWith('...')?'...':'---';
  const insert=('---\n'+yaml+closing+'\n'+(!block?'\n':'')).replace(/\n/g,newline);
  return {from,to,insert};
}
export function notePropertiesTransaction(state:EditorState,rows:NoteProperty[]):TransactionSpec|null {
  if(state.readOnly)throw new Error('当前编辑区只读。');
  const changes=notePropertiesChange(state.doc.toString(),rows);
  if(!changes)return null;
  const description=state.changes(changes),selection=EditorSelection.create(state.selection.ranges.map(range=>range.empty&&range.head>=changes.from&&range.head<=changes.to?EditorSelection.cursor(changes.from+changes.insert.length):range.map(description,1)),state.selection.mainIndex);
  return {changes,selection,userEvent:'input.properties',annotations:isolateHistory.of('full')};
}
