import {describe,it,expect} from 'vitest';
import {EditorState} from '@codemirror/state';
import {history,undo,redo} from '@codemirror/commands';
import {markdownDisplayExtensions,setDisplayMode} from './markdownDisplay';
import {codeBlockLines} from './codeBlockViewport';

function decorated(state:EditorState){const lines:number[]=[];state.field(codeBlockLines).between(0,state.doc.length,(from)=>{lines.push(state.doc.lineAt(from).number);});return lines;}
describe('code block viewport',()=>{
  it('marks fenced and indented code lines in live and source, leaving prose alone',()=>{
    const doc='正文 long text\n\n```text\n├── 第一行\n│   └── 第二行\n```\n\n    缩进代码\n    第二行\n\n后文';
    const state=EditorState.create({doc,extensions:markdownDisplayExtensions});
    expect(decorated(state)).toEqual([3,4,5,6,8,9]);
    const source=state.update({effects:setDisplayMode.of('source')}).state;
    expect(decorated(source)).toEqual([3,4,5,6,8,9]);expect(source.sliceDoc()).toBe(doc);
  });
  it('updates block boundaries on editing without modifying the original text',()=>{
    let state=EditorState.create({doc:'正文\n```\n代码\n```',extensions:markdownDisplayExtensions});
    state=state.update({changes:{from:3,to:7,insert:''}}).state;
    expect(state.sliceDoc()).toBe('正文\n代码\n```');expect(decorated(state)).toEqual([3]);
  });
  it('preserves code content, indentation and undo history while editing',()=>{
    const doc='```text\n├──  目录\n│   └── 文件\n```';let state=EditorState.create({doc,extensions:[markdownDisplayExtensions,history()]});
    state=state.update({changes:{from:doc.indexOf('目录'),insert:'新'},userEvent:'input.type'}).state;
    const target={get state(){return state;},dispatch(tr:ReturnType<EditorState['update']>){state=tr.state;}};
    expect(undo(target)).toBe(true);expect(state.sliceDoc()).toBe(doc);expect(decorated(state)).toEqual([1,2,3,4]);
    expect(redo(target)).toBe(true);expect(state.sliceDoc()).toContain('├──  新目录');
  });
});
