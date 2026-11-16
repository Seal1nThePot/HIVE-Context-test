import {StateEffect,StateField,type EditorState} from '@codemirror/state';
import {Decoration,EditorView,ViewPlugin,type DecorationSet,type ViewUpdate} from '@codemirror/view';
import {SearchQuery,search,setSearchQuery,getSearchQuery,closeSearchPanel} from '@codemirror/search';

export type FindFields={search:string;replace:string;caseSensitive:boolean;wholeWord:boolean;regexp:boolean};
export const emptyFind:FindFields={search:'',replace:'',caseSensitive:false,wholeWord:false,regexp:false};
export const makeSearchQuery=(fields:FindFields)=>new SearchQuery({...fields,literal:!fields.regexp});
const setActive=StateEffect.define<boolean>();
const active=StateField.define({create:()=>false,update(value,tr){for(const effect of tr.effects)if(effect.is(setActive))value=effect.value;return value;}});
const mark=Decoration.mark({class:'cm-searchMatch'}),selectedMark=Decoration.mark({class:'cm-searchMatch cm-searchMatch-selected'});
function highlight(view:EditorView){
  const query=getSearchQuery(view.state);if(!view.state.field(active)||!query.valid)return Decoration.none;
  const ranges=[];let count=0;
  for(const range of view.visibleRanges){const cursor=query.getCursor(view.state,range.from,range.to);for(let next=cursor.next();!next.done&&count<2000;next=cursor.next()){
    const {from,to}=next.value;if(to>from){const selected=view.state.selection.ranges.some(item=>item.from===from&&item.to===to);ranges.push((selected?selectedMark:mark).range(from,to));count++;}
  }}
  return Decoration.set(ranges,true);
}
const marks=ViewPlugin.fromClass(class{
  decorations:DecorationSet;
  constructor(view:EditorView){this.decorations=highlight(view);}
  update(update:ViewUpdate){if(update.docChanged||update.selectionSet||update.viewportChanged||update.transactions.some(tr=>tr.effects.some(effect=>effect.is(setSearchQuery)||effect.is(setActive))))this.decorations=highlight(update.view);}
},{decorations:value=>value.decorations});
export const floatingSearchExtensions=[search(),active,marks];
export function configureFloatingSearch(view:EditorView,enabled:boolean){
  if(view.state.field(active,false)===undefined)view.dispatch({effects:StateEffect.appendConfig.of(floatingSearchExtensions)});
  closeSearchPanel(view);
  if(view.state.field(active)!==enabled)view.dispatch({effects:setActive.of(enabled)});
}
export function searchMatches(state:EditorState,query:SearchQuery,limit=10000){
  if(!query.valid)return {count:0,more:false};const cursor=query.getCursor(state);let count=0;
  for(let next=cursor.next();!next.done;next=cursor.next()){if(count===limit)return {count,more:true};count++;}return {count,more:false};
}
