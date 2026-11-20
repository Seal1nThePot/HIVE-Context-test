import type {EditorSelection,EditorState} from '@codemirror/state';
import {headings,type Heading} from '../../shared/core';
import {outlineTree} from '../editor/markdownParse';

export function textForQuickAI(state:EditorState,selection:EditorSelection,position?:number|null){
  const selected=selection.ranges.filter(range=>!range.empty);
  if(selected.length)return selected.map(range=>state.sliceDoc(range.from,range.to)).join('\n\n');
  if(position==null||position<0||position>state.doc.length||!state.doc.lineAt(position).text.trim())return '';
  const hit=outlineTree(state).resolveInner(position,-1);
  for(let node:typeof hit|null=hit;node;node=node.parent){
    if(/^(?:Paragraph|ATXHeading[1-6]|SetextHeading[12]|FencedCode|CodeBlock)$/.test(node.name)){
      return state.sliceDoc(node.from,node.to);
    }
  }
  const line=state.doc.lineAt(position);
  return state.sliceDoc(line.from,line.to);
}

export function chapterForQuickAI(state:EditorState,requested:Pick<Heading,'from'|'level'|'title'>){
  const outline=headings(state);
  const index=outline.findIndex(heading=>heading.from===requested.from&&heading.level===requested.level&&heading.title===requested.title);
  if(index<0)return '';
  const heading=outline[index],next=outline.slice(index+1).find(other=>other.level<=heading.level);
  return state.sliceDoc(heading.from,next?.from??state.doc.length).trimEnd();
}

export function appendDraftContext(draft:string,label:string,content:string){
  return [draft.trim()?draft:'',`【${label.replace(/\r?\n/g,' ')}】\n${content}`].filter(Boolean).join('\n\n')+'\n\n';
}

export const CHAPTER_DRAG_TYPE='application/x-hive-chapter';
export type ChapterDrag={workspace:string;editor:string;file:string;heading:Pick<Heading,'from'|'level'|'title'>};
export function readChapterDrag(raw:string,workspace:string):ChapterDrag|null{
  try {
    const drag=JSON.parse(raw) as ChapterDrag;
    if(drag.workspace!==workspace||typeof drag.editor!=='string'||typeof drag.file!=='string'||typeof drag.heading?.title!=='string'||!Number.isInteger(drag.heading.from)||drag.heading.from<0||!Number.isInteger(drag.heading.level)||drag.heading.level<1||drag.heading.level>6)return null;
    return drag;
  }catch{return null;}
}
