import type {Text} from '@codemirror/state';
import type {PreviewCell,PreviewReplacement} from './markdownPresentation';

export const tableWidgetCellBudget=256,tableWidgetRowBudget=32;
export type TableSegment={from:number;to:number;fromRow:number;toRow:number};
const segments=new WeakMap<PreviewReplacement,TableSegment[]>();

/** Each replacement is independently virtualized by CodeMirror's ordinary viewport. */
export function tableSegments(item:PreviewReplacement,doc:Text):TableSegment[]{
  const cached=segments.get(item);if(cached)return cached;
  const rows=item.rows||[],columns=item.columns??rows[0]?.length??0,result:TableSegment[]=[];
  if(columns>tableWidgetCellBudget)return result; // A very wide table remains editable source.
  const step=Math.max(1,Math.min(tableWidgetRowBudget,Math.floor(tableWidgetCellBudget/Math.max(1,columns))));
  for(let fromRow=0;fromRow<rows.length;fromRow+=step){
    const toRow=Math.min(rows.length,fromRow+step);
    const start=(row:number)=>doc.lineAt(rows[row][0]?.from??item.rowEnds?.[row]?.to??item.to).from;
    // A source newline must remain between block replacements. Hiding it would join
    // every segment into one CodeMirror line block and mount the entire table again.
    result.push({from:fromRow?start(fromRow):item.from,to:toRow<rows.length?start(toRow)-1:item.to,fromRow,toRow});
  }
  segments.set(item,result);return result;
}

export function tableCell(item:PreviewReplacement,row:number,col:number):PreviewCell|undefined{
  const cells=item.rows?.[row];if(!cells)return undefined;
  if(cells[col])return cells[col];
  const end=item.rowEnds?.[row];
  return end&&col<(item.columns??0)?{from:end.to,to:end.to,text:'',virtual:col,trailing:end.trailing}:undefined;
}

/** DOM identity follows the source table, including independently mounted row segments. */
export function sameSourceTable(a:Element|null|undefined,b:Element|null|undefined){
  if(!a||!b)return false;
  if(a===b)return true;
  const first=(a as HTMLElement).dataset.tableOrdinal,second=(b as HTMLElement).dataset.tableOrdinal;
  return first!==undefined&&first===second&&a.closest('.cm-editor')===b.closest('.cm-editor');
}
