import {describe,it,expect} from 'vitest';
import {EditorState} from '@codemirror/state';
import {history,undo,redo} from '@codemirror/commands';
import {markdownDisplayExtensions,markdownPreview,setDisplayMode,setPreviewFocus} from './markdownDisplay';
import {previewPlan,visibleReplacements} from './markdownPresentation';
import {localImageUrl} from './insertions';

const create=(doc:string,extra:any[]=[])=>EditorState.create({doc,extensions:[history(),markdownDisplayExtensions,...extra]});
function task(state:EditorState){
  let widget:any;state.field(markdownPreview).between(0,state.doc.length,(_a,_b,deco)=>{if(deco.spec.widget?.item?.kind==='task')widget=deco.spec.widget;});return widget;
}
function fixture(initial:EditorState){
  const listeners:Record<string,(event:any)=>void>={};
  const element={setAttribute(){},append(){},addEventListener(name:string,fn:any){listeners[name]=fn;}};
  const ownerDocument={
    createElement:()=>element,
    createElementNS():object{return {ownerDocument,setAttribute(){},removeAttribute(){},replaceChildren(){}};},
  };
  const view:any={state:initial,dom:{ownerDocument},scrollSnapshot:()=>[],dispatch(spec:any){view.state=view.state.update(spec).state;}};
  const elementFor=()=>task(view.state).toDOM(view);
  const click=()=>{elementFor();listeners.click({preventDefault(){},stopPropagation(){}});};
  return {view,click};
}
describe('image and task interactions',()=>{
  it('reveals the language opening when the caret or a multiline selection enters a code block',()=>{
    const doc='before\n\n```powershell\nnpm test\nnpm run build\n```\n\nafter';
    const opening=doc.indexOf('```powershell'),body=doc.indexOf('npm test');
    let state=create(doc).update({selection:{anchor:body},effects:setPreviewFocus.of(true)}).state;
    expect(visibleReplacements(state,true).some(item=>item.from===opening)).toBe(false);
    state=state.update({selection:{anchor:body,head:body+20},userEvent:'select.keyboard'}).state;
    expect(visibleReplacements(state,true).some(item=>item.from===opening)).toBe(false);
    state=state.update({effects:setPreviewFocus.of(false)}).state;
    expect(visibleReplacements(state,false).some(item=>item.from===opening)).toBe(true);
    expect(state.doc.toString()).toBe(doc);
  });
  it('renders Mermaid fences in preview while keeping source mode and active editing intact',()=>{
    const doc='before\n\n```mermaid\nflowchart LR\n A --> B\n```\n\nafter',state=create(doc);
    const diagram=previewPlan(state).replacements.find(item=>item.kind==='mermaid');
    expect(diagram?.text).toBe('flowchart LR\n A --> B');
    expect(visibleReplacements(state,false)).toContain(diagram);
    const editing=state.update({selection:{anchor:doc.indexOf('A --> B')},effects:setPreviewFocus.of(true)}).state;
    expect(visibleReplacements(editing,true)).not.toContain(diagram);
    expect(state.update({effects:setDisplayMode.of('source')}).state.field(markdownPreview).size).toBe(0);
    expect(state.doc.toString()).toBe(doc);
  });
  it('renders wiki images relative to their document, and resolves refreshed reference definitions',()=>{
    let state=create('![[Pasted image 20261117221326.png]]\n\n![说明][pic]\n\n[pic]: ../图片/旧.png');
    let images=previewPlan(state).replacements.filter(item=>item.kind==='image');
    expect(images.map(item=>item.src)).toEqual(['Pasted image 20261117221326.png','../图片/旧.png']);
    const url=localImageUrl(images[0].src!,{file:'docs/plan/facter/正文.md',workspace:'space'})!;
    expect(new URL(url,'http://localhost').searchParams.get('document')).toBe('docs/plan/facter/正文.md');
    state=state.update({changes:{from:state.doc.toString().indexOf('旧.png'),to:state.doc.toString().indexOf('旧.png')+5,insert:'新.png'}}).state;
    images=previewPlan(state).replacements.filter(item=>item.kind==='image');expect(images[1].src).toBe('../图片/新.png');
  });
  it('keeps an image and task visible on the focused line while allowing image source editing',()=>{
    let state=create('![图](a.png)\n- [ ] 工作');state=state.update({effects:setPreviewFocus.of(true),selection:{anchor:0}}).state;
    expect(visibleReplacements(state,true).some(x=>x.kind==='image')).toBe(true);
    state=state.update({selection:{anchor:3}}).state;expect(visibleReplacements(state,true).some(x=>x.kind==='image')).toBe(false);
    state=state.update({selection:{anchor:state.doc.length}}).state;expect(visibleReplacements(state,true).some(x=>x.kind==='task')).toBe(true);
  });
  it('rebuilds decorations only when selection crosses an image boundary on the same line',()=>{
    let state=create('![图](a.png) 后文');state=state.update({effects:setPreviewFocus.of(true),selection:{anchor:0}}).state;
    const rendered=state.field(markdownPreview);expect(visibleReplacements(state,true).some(item=>item.kind==='image')).toBe(true);
    state=state.update({selection:{anchor:1}}).state;expect(state.field(markdownPreview)).not.toBe(rendered);
    const source=state.field(markdownPreview);let imageWidgets=0;source.between(0,state.doc.length,(_a,_b,deco)=>{if(deco.spec.widget?.item?.kind==='image')imageWidgets++;});expect(imageWidgets).toBe(0);
    state=state.update({selection:{anchor:2}}).state;expect(state.field(markdownPreview)).toBe(source);
    state=state.update({selection:{anchor:state.doc.line(1).to}}).state;expect(state.field(markdownPreview)).not.toBe(source);
    state.field(markdownPreview).between(0,state.doc.length,(_a,_b,deco)=>{if(deco.spec.widget?.item?.kind==='image')imageWidgets++;});expect(imageWidgets).toBe(1);
  });
  it('toggles source transactionally and supports undo and redo',()=>{
    const {view,click}=fixture(create('- [ ] 工作'));click();expect(view.state.doc.toString()).toBe('- [x] 工作');
    expect(undo(view)).toBe(true);expect(view.state.doc.toString()).toBe('- [ ] 工作');expect(redo(view)).toBe(true);expect(view.state.doc.toString()).toBe('- [x] 工作');
    click();expect(view.state.doc.toString()).toBe('- [ ] 工作');
  });
  it('never creates task controls in code or source mode and refuses read-only edits',()=>{
    const code=create('```md\n- [ ] 示例\n```\n\n`- [x]`');expect(task(code)).toBeUndefined();
    const source=create('- [ ] 工作').update({effects:setDisplayMode.of('source')}).state;expect(task(source)).toBeUndefined();
    const readOnly=fixture(create('- [x] 工作',[EditorState.readOnly.of(true)]));readOnly.click();expect(readOnly.view.state.doc.toString()).toBe('- [x] 工作');
  });
});
