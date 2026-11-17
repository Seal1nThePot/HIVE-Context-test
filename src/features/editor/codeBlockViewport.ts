import {StateField,type EditorState} from '@codemirror/state';
import {Decoration,EditorView,type DecorationSet} from '@codemirror/view';
import {outlineTree} from './markdownParse';

/** CodeMirror renders one element per source line, so all code lines share the
 * editor's horizontal scroller rather than creating independent row scrollers. */
function codeLines(state:EditorState):DecorationSet{
  const lines=new Set<number>();
  outlineTree(state).iterate({enter(node){
    if(node.name!=='FencedCode'&&node.name!=='CodeBlock')return;
    const first=state.doc.lineAt(node.from).number,last=state.doc.lineAt(Math.max(node.from,node.to-1)).number;
    for(let number=first;number<=last;number++)lines.add(state.doc.line(number).from);
    return false;
  }});
  return Decoration.set([...lines].sort((a,b)=>a-b).map(from=>Decoration.line({class:'cm-code-nowrap'}).range(from)));
}
export const codeBlockLines=StateField.define<DecorationSet>({
  create:codeLines,
  update(value,tr){return tr.docChanged?codeLines(tr.state):value;},
  provide:field=>EditorView.decorations.from(field),
});

const shiftWheel=EditorView.domEventHandlers({
  wheel(event,view){
    const scroller=view.scrollDOM;
    if(!event.shiftKey||event.ctrlKey||event.metaKey||event.deltaX!==0||!event.deltaY||scroller.scrollWidth<=scroller.clientWidth)return false;
    const scale=event.deltaMode===1?view.defaultLineHeight:event.deltaMode===2?scroller.clientWidth:1;
    scroller.scrollLeft+=event.deltaY*scale;
    event.preventDefault();return true;
  },
});
const codeViewportTheme=EditorView.theme({
  '.cm-line.cm-code-nowrap':{whiteSpace:'pre !important',overflowWrap:'normal !important',wordBreak:'normal !important',width:'max-content',minWidth:'100%',boxSizing:'border-box'},
});
export const codeBlockViewport=[codeBlockLines,shiftWheel,codeViewportTheme];
