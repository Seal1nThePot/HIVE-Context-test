import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {EditorState} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';
import type {MathResult} from './mathRender';
import {MathWidget} from './mathWidget';
import {mathRenderer} from './mathRenderer';
import {mathCommits} from './mathCommitQueue';

// A small DOM surface records lifecycle writes; real KaTeX HTML is tested separately.
class FakeText{constructor(public textContent:string){}}
class FakeElement{
  className='';title='';dataset:Record<string,string>={};isConnected=true;htmlWrites=0;
  children:(FakeElement|FakeText)[]=[];private text='';private html='';
  private listeners=new Map<string,(event:{preventDefault:()=>void;stopPropagation:()=>void})=>void>();
  constructor(readonly ownerDocument:FakeDocument,readonly tagName:string){}
  get firstChild(){return this.children[0]||null;}
  get textContent():string{return this.text+this.children.map(child=>child.textContent).join('');}
  set textContent(value:string){this.text=value;this.children=[];this.html='';}
  get innerHTML(){return this.html;}
  set innerHTML(value:string){this.html=value;this.text='';this.children=[];this.htmlWrites++;}
  replaceChildren(){this.text='';this.html='';this.children=[];}
  append(...nodes:(FakeElement|FakeText)[]){this.children.push(...nodes);}
  addEventListener(name:string,listener:(event:{preventDefault:()=>void;stopPropagation:()=>void})=>void){this.listeners.set(name,listener);}
  click(){this.listeners.get('mousedown')?.({preventDefault:vi.fn(),stopPropagation:vi.fn()});}
}
class FakeDocument{
  createElement(name:string){return new FakeElement(this,name);}
  createTextNode(text:string){return new FakeText(text);}
}
function viewFor(doc:string,readOnly=false){return {state:EditorState.create({doc,extensions:EditorState.readOnly.of(readOnly)}),dom:{ownerDocument:new FakeDocument()},dispatch:vi.fn(),focus:vi.fn(),requestMeasure:vi.fn()} as unknown as EditorView;}
function changeDoc(view:EditorView,doc:string){(view as unknown as {state:EditorState}).state=EditorState.create({doc});}
function widget(view:EditorView){
  const text=view.state.doc.toString(),from=text.indexOf('$'),to=text.indexOf('$',from+1)+1;
  return new MathWidget({from,to,reveal:{from,to},kind:'math',block:false},view.state.doc);
}
type Request={source:string;callback:(result:MathResult)=>void;cancel:ReturnType<typeof vi.fn>};
let requests:Request[],restore:()=>void;
beforeEach(()=>{
  vi.useFakeTimers();mathCommits.dispose();requests=[];
  const spy=vi.spyOn(mathRenderer,'request').mockImplementation((source,_block,callback)=>{const cancel=vi.fn();requests.push({source,callback,cancel});return cancel;});restore=()=>spy.mockRestore();
});
afterEach(()=>{mathCommits.dispose();restore();vi.useRealTimers();});

describe('math widget DOM reuse across unrelated edits',()=>{
  it('keeps already rendered DOM without re-requesting or returning to pending',()=>{
    const view=viewFor('before $x$ after'),old=widget(view),dom=old.toDOM(view),element=dom as unknown as FakeElement;
    requests[0].callback({html:'<span class="katex">x</span>'});vi.advanceTimersByTime(16);
    expect(element.dataset.mathState).toBe('rendered');expect(element.htmlWrites).toBe(1);
    changeDoc(view,'before $x$ after edited');const next=widget(view);
    expect(next.eq(old)).toBe(false);expect(next.updateDOM(dom,view)).toBe(true);
    expect(requests).toHaveLength(1);expect(element.dataset.mathState).toBe('rendered');expect(element.htmlWrites).toBe(1);
    expect(element.innerHTML).toContain('katex');expect(element.textContent).not.toContain('排版中');
    next.destroy(dom);
  });
  it('refreshes click coordinates after text is inserted before the reused formula',()=>{
    const view=viewFor('before $x$ after'),old=widget(view),dom=old.toDOM(view);
    changeDoc(view,'new prefix before $x$ after');const next=widget(view);
    expect(next.updateDOM(dom,view)).toBe(true);(dom as unknown as FakeElement).click();
    expect(view.dispatch).toHaveBeenLastCalledWith({selection:{anchor:18},userEvent:'select.widget'});
    expect(requests).toHaveLength(1);next.destroy(dom);
  });
  it('keeps the rendered formula and selection intact when clicked in read-only mode',()=>{
    const view=viewFor('before $x$ after',true),formula=widget(view),dom=formula.toDOM(view);
    (dom as unknown as FakeElement).click();
    expect(view.dispatch).not.toHaveBeenCalled();
    expect(view.focus).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
    formula.destroy(dom);
  });
  it('retains a computed result when a document update precedes updateDOM',()=>{
    const view=viewFor('before $x$ after'),old=widget(view),dom=old.toDOM(view),element=dom as unknown as FakeElement;
    changeDoc(view,'new prefix before $x$ after');requests[0].callback({html:'<span>x</span>'});
    vi.advanceTimersByTime(16);expect(element.htmlWrites).toBe(0);
    const next=widget(view);expect(next.updateDOM(dom,view)).toBe(true);vi.advanceTimersByTime(16);
    expect(element.dataset.mathState).toBe('rendered');expect(element.innerHTML).toBe('<span>x</span>');expect(requests).toHaveLength(1);
    next.destroy(dom);
  });
  it('finishes a still pending worker request against refreshed document metadata',()=>{
    const view=viewFor('before $x$ after'),old=widget(view),dom=old.toDOM(view),element=dom as unknown as FakeElement;
    changeDoc(view,'before $x$ edited');const next=widget(view);expect(next.updateDOM(dom,view)).toBe(true);
    requests[0].callback({html:'<span>current</span>'});vi.advanceTimersByTime(16);
    expect(element.innerHTML).toBe('<span>current</span>');expect(requests).toHaveLength(1);next.destroy(dom);
  });
  it('does not reuse a different formula and prevents changed or destroyed sources from late writes',()=>{
    const view=viewFor('before $x$ after'),old=widget(view),dom=old.toDOM(view),element=dom as unknown as FakeElement;
    requests[0].callback({html:'<span>stale queued</span>'});expect(mathCommits.size).toBe(1);
    changeDoc(view,'before $y$ after');const next=widget(view);expect(next.updateDOM(dom,view)).toBe(false);
    old.destroy(dom);expect(mathCommits.size).toBe(0);const nextDom=next.toDOM(view),nextElement=nextDom as unknown as FakeElement;
    requests[0].callback({html:'<span>late x</span>'});requests[1].callback({html:'<span>new y</span>'});vi.advanceTimersByTime(16);
    expect(element.htmlWrites).toBe(0);expect(requests[0].cancel).toHaveBeenCalledOnce();expect(nextElement.innerHTML).toBe('<span>new y</span>');
    next.destroy(nextDom);requests[1].callback({html:'<span>after destroy</span>'});vi.advanceTimersByTime(16);expect(nextElement.innerHTML).toBe('<span>new y</span>');
  });
  it('refreshes over-budget notice coordinates without reading or replacing its long source',()=>{
    const view=viewFor('$$\n'+'x'.repeat(6001)+'\n$$'),from=0,to=view.state.doc.length;
    const old=new MathWidget({from,to,reveal:{from,to},kind:'math',block:true,text:'公式超过 4096 字符，显示源码'},view.state.doc),read=vi.spyOn(view.state.doc,'sliceString');
    const dom=old.toDOM(view);expect(read).not.toHaveBeenCalled();expect(requests).toHaveLength(0);
    changeDoc(view,'prefix\n$$\n'+'x'.repeat(6001)+'\n$$');const readNext=vi.spyOn(view.state.doc,'sliceString');
    const next=new MathWidget({from:7,to:view.state.doc.length,reveal:{from:7,to:view.state.doc.length},kind:'math',block:true,text:old.item.text},view.state.doc);
    expect(next.updateDOM(dom,view)).toBe(true);(dom as unknown as FakeElement).click();
    expect(readNext).not.toHaveBeenCalled();expect(view.dispatch).toHaveBeenLastCalledWith({selection:{anchor:7},userEvent:'select.widget'});
    expect((dom as unknown as FakeElement).textContent).toContain('4096');next.destroy(dom);
  });
});
