import type {ChangeSpec,Text} from '@codemirror/state';
import type {PreviewReplacement} from './markdownPresentation';

export type TableAction='row-before'|'row-after'|'column-before'|'column-after'|'delete-row'|'delete-column';
export type TableOperation={changes:ChangeSpec[];row:number;col:number};

/** Structural edits retain original cell source, including escapes and alignment markers. */
export function tableOperation(doc:Text,item:PreviewReplacement,row:number,col:number,action:TableAction):TableOperation|null{
  const rows=item.rows||[],columns=item.columns??rows[0]?.length??0;
  if(!rows[row]||col<0||col>=columns)return null;
  const rowLine=(index:number)=>doc.lineAt(rows[index][0]?.from??item.rowEnds?.[index]?.to??item.from);
  const header=rowLine(0),separator=doc.line(header.number+1);
  const rowStart=(index:number)=>{const cell=rows[index][0];if(!cell)return rowLine(index).from;return cell.from>0&&doc.sliceString(cell.from-1,cell.from)==='|'?cell.from-1:cell.from;};
  const prefix=doc.sliceString(header.from,rowStart(0));
  if(action==='row-before'||action==='row-after'){
    if(action==='row-before'&&row===0)return null;
    const target=action==='row-before'?row:row+1;
    const blank=prefix+'| '+Array(columns).fill('').join(' | ')+' |';
    const before=target<rows.length?rowLine(target):null;
    const from=before?.from??(row===0?separator.to:rowLine(row).to);
    return {changes:[{from,insert:before?blank+'\n':'\n'+blank}],row:target,col};
  }
  if(action==='delete-row'){
    if(row===0)return null; // A Markdown table always keeps its header and separator.
    const line=rowLine(row),hasNext=line.to<doc.length;
    return {changes:[{from:hasNext?line.from:line.from-1,to:hasNext?line.to+1:line.to}],row:Math.min(row,rows.length-2),col};
  }
  if(action==='delete-column'&&columns===1)return null;
  const index=action==='column-after'?col+1:col,changes:ChangeSpec[]=[];
  // Include the syntax-only separator, which has no rendered row index.
  const lines=[{line:header,base:rowStart(0)},{line:separator,base:separator.from+prefix.length},...rows.slice(1).map((_r,index)=>({line:rowLine(index+1),base:rowStart(index+1)}))];
  for(const {line,base} of lines){
    const text=doc.sliceString(base,line.to);
    // Pipes escaped with an odd number of backslashes are ordinary cell content.
    const pipes:number[]=[];let slashes=0;
    for(let i=0;i<text.length;i++){const char=text[i];if(char==='|'&&slashes%2===0)pipes.push(i);slashes=char==='\\'?slashes+1:0;}
    const first=pipes[0],last=pipes.at(-1),leading=first!==undefined&&!text.slice(0,first).trim(),trailing=last!==undefined&&!text.slice(last+1).trim();
    const starts=[...(leading?[]:[0]),...pipes.map(pos=>pos+1)],ends=[...pipes,...(trailing?[]:[text.length])];
    if(trailing)starts.pop();if(leading)ends.shift();
    const count=starts.length;
    if(action==='delete-column'){
      if(index>=count)continue; // A padded missing cell has no source to remove.
      const from=index+1<count?starts[index]:index>0?ends[index-1]:starts[index];
      const to=index+1<count?starts[index+1]:ends[index];
      changes.push({from:base+from,to:base+to});
      // With one column left, a bare `value` / `---` pair would become a heading.
      if(columns===2){if(!leading)changes.push({from:base,insert:'|'});if(!trailing)changes.push({from:line.to,insert:'|'});}
    }else{
      const syntax=line.number===separator.number?' ---':' ';
      if(index<count)changes.push({from:base+starts[index],insert:syntax+'|'});
      else{
        const at=trailing?last!:text.trimEnd().length;
        const missing=Math.max(0,index-count);
        changes.push({from:base+at,insert:'| '+Array(missing).fill(' | ').join('')+(line.number===separator.number?'---':'')+(trailing?' ':' |')});
      }
    }
  }
  return {changes,row,col:action==='delete-column'?Math.min(col,columns-2):index};
}
