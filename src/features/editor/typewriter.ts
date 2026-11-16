import {EditorState,StateEffect,StateField,Transaction,type Extension} from '@codemirror/state';
import {EditorView,ViewPlugin,type ViewUpdate} from '@codemirror/view';

export const setTypewriter=StateEffect.define<boolean>();
export const typewriterEnabled=StateField.define<boolean>({
  create:()=>false,
  update(value,tr){for(const effect of tr.effects)if(effect.is(setTypewriter))value=effect.value;return value;},
  provide:field=>EditorView.editorAttributes.from(field,enabled=>({'data-typewriter':String(enabled)})),
});

// Mouse selection, scrolling, paste, formatting, AI and disk updates do not pull the viewport back.
export function isTypewriterInput(tr:Transaction){
  const event=tr.annotation(Transaction.userEvent)||'';
  if(!tr.docChanged)return tr.selection!==undefined&&event==='select'&&tr.newSelection.main.empty;
  return event==='input'||tr.isUserEvent('input.type')||/^delete(?:\.(?:backward|forward|selection|line))?$/.test(event);
}
const centerTypedLine=EditorState.transactionExtender.of(tr=>tr.state.field(typewriterEnabled,false)&&(isTypewriterInput(tr)||tr.effects.some(effect=>effect.is(setTypewriter)&&effect.value))
  ?{effects:EditorView.scrollIntoView(tr.newSelection.main.head,{y:'center',x:'nearest'})}:null);

const measurePadding=ViewPlugin.fromClass(class{
  constructor(readonly view:EditorView){this.measure();}
  update(update:ViewUpdate){
    if(update.geometryChanged||update.startState.field(typewriterEnabled)!==update.state.field(typewriterEnabled))this.measure();
  }
  measure(){this.view.requestMeasure({key:this,read:view=>Math.max(0,(view.scrollDOM.clientHeight-view.defaultLineHeight)/2),write:(padding,view)=>{
    const value=padding+'px';if(view.dom.style.getPropertyValue('--typewriter-padding')!==value)view.dom.style.setProperty('--typewriter-padding',value);
  }});}
});
export const typewriterExtensions:Extension=[typewriterEnabled,centerTypedLine,measurePadding,EditorView.baseTheme({
  '&[data-typewriter=true] .cm-content':{paddingTop:'var(--typewriter-padding, 240px)',paddingBottom:'max(120px, var(--typewriter-padding, 240px))'},
})];

export function configureTypewriter(view:EditorView,enabled:boolean){
  const current=view.state.field(typewriterEnabled,false);
  if(current===undefined)view.dispatch({effects:StateEffect.appendConfig.of(typewriterExtensions)});
  if(view.state.field(typewriterEnabled)!==enabled)view.dispatch({effects:setTypewriter.of(enabled)});
}
