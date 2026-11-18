import {StateEffect, StateField, type EditorState, type Extension} from '@codemirror/state';
import {codeFolding, foldEffect, unfoldEffect, foldedRanges} from '@codemirror/language';
import {Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet} from '@codemirror/view';
import {outlineTree} from './markdownParse';

export type HeadingFold = {from:number; to:number; lineFrom:number; level:number};
/** Use the Markdown parser so code blocks and frontmatter never become headings. */
export function headingFolds(state:EditorState):HeadingFold[]{
  const headings:{lineFrom:number; end:number; level:number}[]=[];
  const cursor=outlineTree(state).cursor();
  do {
    const match=/^(?:ATX|Setext)Heading([1-6])$/.exec(cursor.name);
    if(match){const line=state.doc.lineAt(cursor.from),end=state.doc.lineAt(Math.max(cursor.from,cursor.to-1));headings.push({lineFrom:line.from,end:end.to,level:Number(match[1])});}
  } while(cursor.next());
  const result:HeadingFold[]=[], stack:typeof headings=[];
  for(let index=headings.length-1;index>=0;index--){
    const heading=headings[index];while(stack.length&&stack[stack.length-1].level>heading.level)stack.pop();
    const next=stack.at(-1),to=next?Math.max(heading.end,next.lineFrom-1):state.doc.length;
    if(to>heading.end)result.push({from:heading.end,to,lineFrom:heading.lineFrom,level:heading.level});stack.push(heading);
  }
  return result.reverse();
}
export function foldingEffects(state:EditorState){
  const effects:StateEffect<unknown>[]=[];
  foldedRanges(state).between(0,state.doc.length,(from,to)=>{effects.push(foldEffect.of({from,to}));});
  return effects;
}
export function isFoldingEffect(effect:StateEffect<unknown>){return effect.is(foldEffect)||effect.is(unfoldEffect);}
class FoldButton extends WidgetType {
  constructor(readonly range:HeadingFold,readonly folded:boolean){super();}
  eq(other:FoldButton){return this.range.from===other.range.from&&this.range.to===other.range.to&&this.folded===other.folded;}
  toDOM(view:EditorView){
    const button=view.dom.ownerDocument.createElement('button');button.type='button';button.className='cm-heading-fold';
    button.textContent=this.folded?'▸':'▾';button.setAttribute('aria-label',this.folded?'展开标题内容':'折叠标题内容');button.title=button.getAttribute('aria-label')!;
    button.addEventListener('mousedown',event=>event.preventDefault());
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();view.dispatch({effects:(this.folded?unfoldEffect:foldEffect).of({from:this.range.from,to:this.range.to})});});
    return button;
  }
  ignoreEvent(){return false;}
}
function decorations(view:EditorView):DecorationSet{
  const folded=new Map<number,number>();foldedRanges(view.state).between(0,view.state.doc.length,(from,to)=>{folded.set(from,to);});
  const ranges=headingFolds(view.state).filter(h=>view.visibleRanges.some(r=>h.lineFrom>=r.from&&h.lineFrom<=r.to));
  return Decoration.set(ranges.map(h=>Decoration.widget({widget:new FoldButton(folded.has(h.from)?{...h,to:folded.get(h.from)!}:h,folded.has(h.from)),side:-1}).range(h.lineFrom)),true);
}
export const foldingMarker=StateField.define({create:()=>true,update:value=>value});
export const headingFolding:Extension=[foldingMarker,codeFolding(),ViewPlugin.fromClass(class {
  decorations:DecorationSet;
  constructor(view:EditorView){this.decorations=decorations(view);}
  update(update:import('@codemirror/view').ViewUpdate){if(update.docChanged||update.viewportChanged||update.transactions.some(tr=>tr.effects.some(isFoldingEffect)))this.decorations=decorations(update.view);}
},{decorations:value=>value.decorations})];

