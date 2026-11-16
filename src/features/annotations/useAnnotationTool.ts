import {useEffect,useRef,type RefObject} from 'react';
import type {EditorView} from '@codemirror/view';

export function isAnnotationSelectionKey(event: Pick<KeyboardEvent,'key'|'shiftKey'|'isComposing'>) {
  return !event.isComposing && event.shiftKey && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key);
}

// Commit only a finished selection gesture; ordinary selection and cancelled drags do nothing.
export function useAnnotationTool(editor:RefObject<EditorView|null>,enabled:boolean,onMark?:()=>void){
  const callback=useRef(onMark);callback.current=onMark;
  useEffect(()=>{
    if(!enabled)return;
    let gesture:{pointer:number;view:EditorView;doc:EditorView['state']['doc']}|null=null,frame=0;
    let keyboard:{view:EditorView;doc:EditorView['state']['doc'];initial:string}|null=null,composing=false;
    const commit=(view:EditorView,doc:EditorView['state']['doc'])=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        if(editor.current===view&&view.hasFocus&&view.state.doc===doc&&!view.state.readOnly&&view.state.selection.ranges.some(range=>!range.empty))callback.current?.();
      });
    };
    const down=(event:PointerEvent)=>{
      const view=editor.current,target=event.target;
      if(!composing&&event.button===0&&event.isPrimary&&view&&target instanceof Element&&target.closest('.cm-content')&&!target.closest('[data-table-widget]')&&view.dom.contains(target))gesture={pointer:event.pointerId,view,doc:view.state.doc};
    };
    const up=(event:PointerEvent)=>{if(gesture?.pointer!==event.pointerId)return;const selected=gesture;gesture=null;commit(selected.view,selected.doc);};
    const cancel=()=>{gesture=null;keyboard=null;cancelAnimationFrame(frame);};
    const selectionKey=(view:EditorView)=>JSON.stringify(view.state.selection.ranges.map(r=>[r.anchor,r.head]));
    const keydown=(event:KeyboardEvent)=>{const view=editor.current,target=event.target;
      if(composing||!isAnnotationSelectionKey(event)||!view?.hasFocus||!(target instanceof Element)||target.closest('[data-table-widget]'))return;
      if(!keyboard)keyboard={view,doc:view.state.doc,initial:selectionKey(view)};
    };
    const key=(event:KeyboardEvent)=>{if(event.key!=='Shift')return;const selected=keyboard;keyboard=null;if(selected&&!composing&&!event.isComposing&&selected.doc===selected.view.state.doc&&selected.initial!==selectionKey(selected.view))commit(selected.view,selected.doc);};
    const compositionStart=()=>{composing=true;keyboard=null;};const compositionEnd=()=>{composing=false;};
    document.addEventListener('pointerdown',down,true);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',cancel);document.addEventListener('keydown',keydown);document.addEventListener('keyup',key);document.addEventListener('compositionstart',compositionStart);document.addEventListener('compositionend',compositionEnd);window.addEventListener('blur',cancel);
    return()=>{cancel();document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',keydown);document.removeEventListener('keyup',key);document.removeEventListener('compositionstart',compositionStart);document.removeEventListener('compositionend',compositionEnd);window.removeEventListener('blur',cancel);};
  },[editor,enabled]);
}
