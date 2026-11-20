import {EditorView,WidgetType} from '@codemirror/view';
import {mountMermaidViewer} from './mermaidViewer';
import type {PreviewReplacement} from './markdownPresentation';

// Mermaid shares parser/configuration state. Serialize renders and discard
// detached results; each diagram receives its own SVG identifiers.
let renderer:Promise<typeof import('mermaid')['default']>|undefined;
let pending:Promise<unknown>=Promise.resolve(),ordinal=0;
const active=new WeakSet<HTMLElement>();
const disposeViewers=new WeakMap<HTMLElement,()=>void>();
export const MERMAID_SOURCE_LIMIT=50000;
async function render(source:string){
  if(source.length>MERMAID_SOURCE_LIMIT)throw new Error('图表超过 50000 字符，请缩小图表后重试。');
  renderer??=import('mermaid').then(module=>{
    const api=module.default;
    api.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:false,secure:['secure','securityLevel','startOnLoad','maxTextSize','maxEdges','htmlLabels'],suppressErrorRendering:true,maxTextSize:MERMAID_SOURCE_LIMIT,maxEdges:500,theme:'neutral'});
    return api;
  });
  const api=await renderer;
  // Render in the module's document. SVG can then be adopted by a detached panel
  // without Mermaid consulting a different window's global document.
  const staging=document.createElement('div');staging.style.cssText='position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none';document.body.append(staging);
  try{
    const {svg}=await api.render('hive-mermaid-'+(++ordinal),source,staging);
    return svg;
  }finally{staging.remove();}
}
export class MermaidWidget extends WidgetType{
  constructor(readonly item:PreviewReplacement,readonly readOnly=false){super();}
  eq(other:MermaidWidget){return this.item.text===other.item.text&&this.item.from===other.item.from&&this.item.to===other.item.to&&this.readOnly===other.readOnly;}
  get estimatedHeight(){return 180;}
  toDOM(view:EditorView){
    const root=view.dom.ownerDocument.createElement('div');root.className='cm-mermaid-widget';root.contentEditable='false';active.add(root);
    const edit=root.ownerDocument.createElement('button');edit.type='button';edit.textContent='编辑 Mermaid 源码';
    edit.addEventListener('mousedown',event=>event.preventDefault());
    edit.addEventListener('click',()=>{if(view.state.readOnly)return;view.dispatch({selection:{anchor:Math.min(this.item.from+1,view.state.doc.length)},scrollIntoView:true,userEvent:'select.widget'});view.focus();});
    const output=root.ownerDocument.createElement('div');output.setAttribute('role','img');output.setAttribute('aria-label','Mermaid 图表');output.textContent='正在绘制图表…';
    if(!this.readOnly)root.append(edit);
    root.append(output);
    const job=pending.then(()=>active.has(root)?render(this.item.text||''):undefined);pending=job.catch(()=>{});
    void job.then(svg=>{if(!active.has(root)||svg===undefined)return;output.innerHTML=svg;
      const diagram=output.querySelector('svg');
      if(diagram)disposeViewers.set(root,mountMermaidViewer(output,diagram,view.scrollDOM));
      view.requestMeasure();},error=>{
      if(!active.has(root))return;output.setAttribute('role','status');output.textContent='Mermaid 无法渲染：'+(error instanceof Error?error.message:String(error));
      const source=root.ownerDocument.createElement('pre');source.textContent=this.item.text||'';output.append(source);view.requestMeasure();
    });
    return root;
  }
  destroy(root:HTMLElement){active.delete(root);disposeViewers.get(root)?.();disposeViewers.delete(root);}
  ignoreEvent(){return true;}
}
