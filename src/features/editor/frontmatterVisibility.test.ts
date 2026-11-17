import {describe,it,expect} from 'vitest';
import {EditorState} from '@codemirror/state';
import {history,undoDepth} from '@codemirror/commands';
import {markdownDisplayExtensions,markdownPreview,setDisplayMode,setFrontmatterVisibility} from './markdownDisplay';

describe('frontmatter visibility',()=>{
  it('changes live preview without editing text or history and source mode remains complete',()=>{
    const source='---\ntitle: 标题\n---\n\n正文';
    let state=EditorState.create({doc:source,extensions:[history(),markdownDisplayExtensions]});
    state=state.update({effects:setFrontmatterVisibility.of(false)}).state;
    const ranges:{from:number;to:number}[]=[];
    state.field(markdownPreview).between(0,state.doc.length,(from,to)=>{ranges.push({from,to});});
    expect(ranges.some(item=>item.from===0&&item.to>0)).toBe(true);
    expect(state.doc.toString()).toBe(source);expect(undoDepth(state)).toBe(0);
    state=state.update({effects:setDisplayMode.of('source')}).state;
    const sourceRanges:{from:number;to:number}[]=[];
    state.field(markdownPreview).between(0,state.doc.length,(from,to)=>{sourceRanges.push({from,to});});
    expect(sourceRanges).toEqual([]);expect(state.doc.toString()).toBe(source);
  });
});
