import type {Text} from '@codemirror/state';
import {EditorView,WidgetType} from '@codemirror/view';
import type {PreviewReplacement} from './markdownPresentation';
import {mathRenderer} from './mathRenderer';
import {mathCommits} from './mathCommitQueue';
import {mathSource} from './mathSyntax';
import type {MathResult} from './mathRender';
import 'katex/dist/katex.min.css';
import './math.css';

type Controller={
  element:HTMLElement;item:PreviewReplacement;doc:Text;view:EditorView;
  raw:string;source:string;status:string;generation:number;destroyed:boolean;
  result?:MathResult;committed:boolean;cancelRender?:()=>void;cancelCommit:(()=>void)|null;
};
const controllers=new WeakMap<HTMLElement,Controller>();
function showSource(controller:Controller,status:string){
  const {element}=controller;controller.status=status;element.replaceChildren();
  const notice=element.ownerDocument.createElement('span');notice.className='cm-math-notice';notice.textContent='〔'+status+'〕';
  element.append(notice,element.ownerDocument.createTextNode(controller.raw));
}
function scheduleResult(controller:Controller){
  if(controller.destroyed||controller.committed||!controller.result||controller.cancelCommit)return;
  const generation=controller.generation;
  controller.cancelCommit=mathCommits.enqueue(()=>{
    controller.cancelCommit=null;
    const {element,view,result}=controller;
    // Keep a computed result if updateDOM has not yet refreshed its document identity.
    // The same-source updateDOM will schedule it again with the new source coordinates.
    if(controller.destroyed||generation!==controller.generation||!element.isConnected||view.state.doc!==controller.doc||!result)return;
    if(result.html!==undefined){element.innerHTML=result.html;element.dataset.mathState='rendered';element.title='点击编辑公式源码；较大公式可在区域内滚动查看';}
    else {showSource(controller,result.error);element.dataset.mathState='source';}
    controller.committed=true;view.requestMeasure();
  });
  if(!controller.cancelCommit){
    controller.status='视区公式超过显示预算，显示源码；移出视区后可重试';
    controller.element.firstChild!.textContent='〔'+controller.status+'〕';controller.element.dataset.mathState='source';controller.view.requestMeasure();
  }
}
export class MathWidget extends WidgetType{
  constructor(readonly item:PreviewReplacement,readonly doc:Text){super();}
  eq(other:MathWidget){return this.doc===other.doc&&this.item.from===other.item.from&&this.item.to===other.item.to&&this.item.block===other.item.block&&this.item.text===other.item.text;}
  toDOM(view:EditorView){
    const item=this.item,element=view.dom.ownerDocument.createElement(item.block?'div':'span');
    element.className=item.text?'cm-math-notice':'cm-math-widget';
    element.dataset.mathState=item.text?'source':'pending';
    element.title='点击编辑公式源码';
    const controller:Controller={element,item,doc:this.doc,view,raw:'',source:'',status:'',generation:1,destroyed:false,committed:false,cancelCommit:null};
    controllers.set(element,controller);
    element.addEventListener('mousedown',event=>{
      if(controller.destroyed||controller.view.state.readOnly)return;
      event.preventDefault();event.stopPropagation();controller.view.dispatch({selection:{anchor:controller.item.from},userEvent:'select.widget'});controller.view.focus();
    });
    if(item.text){element.textContent='〔'+item.text+'〕';return element;}
    // Only mounted, budget-eligible widgets read their own original source range.
    controller.raw=this.doc.sliceString(item.from,item.to);controller.source=mathSource(controller.raw,!!item.block);
    showSource(controller,'公式排版中');const generation=controller.generation;
    controller.cancelRender=mathRenderer.request(controller.source,!!item.block,result=>{
      if(controller.destroyed||generation!==controller.generation)return;
      controller.result=result;scheduleResult(controller);
    });
    return element;
  }
  updateDOM(dom:HTMLElement,view:EditorView){
    const controller=controllers.get(dom),item=this.item;
    if(!controller||controller.destroyed||!!controller.item.block!==!!item.block)return false;
    if(item.text||controller.item.text){
      if(item.text!==controller.item.text)return false;
      controller.item=item;controller.doc=this.doc;controller.view=view;return true;
    }
    const raw=this.doc.sliceString(item.from,item.to),source=mathSource(raw,!!item.block);
    // CodeMirror tries several cached widgets. Never consume another formula's DOM
    // just because it has the same WidgetType, or one edit would cascade into redraws.
    if(source!==controller.source)return false;
    const rawChanged=raw!==controller.raw;
    controller.item=item;controller.doc=this.doc;controller.view=view;controller.raw=raw;
    if(rawChanged&&dom.dataset.mathState!=='rendered')showSource(controller,controller.status);
    scheduleResult(controller);return true;
  }
  destroy(dom:HTMLElement){
    const controller=controllers.get(dom);if(!controller)return;
    controller.destroyed=true;controller.generation++;controller.cancelRender?.();controller.cancelCommit?.();controllers.delete(dom);
  }
  ignoreEvent(){return false;}
}
