import {StateField,type EditorState,type Text} from '@codemirror/state';
import {TreeFragment,type ChangedRange,type Input,type Tree} from '@lezer/common';
import {parser,GFM} from '@lezer/markdown';
import {documentFrontmatter} from '../../shared/frontmatter';
import {outlineMarkdownParser} from './sourceSyntax';
import {quotedStrong} from './quotedStrong';

const markdownParser=parser.configure([GFM,quotedStrong]);
type ParsedDocument={doc:Text;fragments:readonly TreeFragment[];tree?:Tree;outlineFragments:readonly TreeFragment[];outlineTree?:Tree};
const cache=new WeakMap<Text,ParsedDocument>();
function record(doc:Text){let value=cache.get(doc);if(!value){value={doc,fragments:[],outlineFragments:[]};cache.set(doc,value);}return value;}

/** Lazy parse state: source-only editors never pay for the live preview parser. */
export const markdownParseState=StateField.define<ParsedDocument>({
  create:state=>record(state.doc),
  update(value,tr){
    if(!tr.docChanged)return value;
    const existing=cache.get(tr.state.doc);if(existing)return existing;
    const changes:ChangedRange[]=[];
    tr.changes.iterChangedRanges((fromA,toA,fromB,toB)=>changes.push({fromA,toA,fromB,toB}));
    const previousMetadata=documentFrontmatter(value.doc),nextMetadata=documentFrontmatter(tr.state.doc);
    const maskChanged=!!previousMetadata!==!!nextMetadata||!!previousMetadata&&!!nextMetadata&&tr.changes.mapPos(previousMetadata.to,1)!==nextMetadata.to;
    const next={doc:tr.state.doc,fragments:maskChanged?[]:TreeFragment.applyChanges(value.tree?TreeFragment.addTree(value.tree):value.fragments,changes),outlineFragments:maskChanged?[]:TreeFragment.applyChanges(value.outlineTree?TreeFragment.addTree(value.outlineTree):value.outlineFragments,changes)};
    cache.set(tr.state.doc,next);return next;
  },
});

function input(doc:Text):Input{
    const metadata=documentFrontmatter(doc);
    const mask=(text:string,from:number)=>metadata&&from<metadata.to?text.slice(0,metadata.to-from).replace(/[^\r\n]/g,' ')+text.slice(Math.max(0,metadata.to-from)):text;
    return {length:doc.length,lineChunks:true,chunk(from){return mask(doc.iterRange(from).next().value,from);},read(from,to){return mask(doc.sliceString(from,to),from);}};
}
export function markdownTree(state:EditorState){
  const value=state.field(markdownParseState,false)||record(state.doc);
  if(!value.tree){
    value.tree=markdownParser.parse(input(state.doc),value.fragments);
    value.fragments=[];
  }
  return value.tree;
}

/** Source mode needs exact heading/block boundaries, not a second full table-cell AST. */
export function outlineTree(state:EditorState){
  const value=state.field(markdownParseState,false)||record(state.doc);
  if(value.tree)return value.tree;
  if(!value.outlineTree){value.outlineTree=outlineMarkdownParser.parse(input(state.doc),value.outlineFragments);value.outlineFragments=[];}
  return value.outlineTree;
}
