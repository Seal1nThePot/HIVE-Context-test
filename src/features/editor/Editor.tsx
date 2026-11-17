import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {usePanelDocument} from '../../shared/panelDocument';
import { EditorState, EditorSelection,type Text } from "@codemirror/state";
import EditorContextMenu, {type AnnotationContext} from './EditorContextMenu';
import {useAnnotationTool} from '../annotations/useAnnotationTool';
import {
  EditorView,
  keymap,
  drawSelection,
  highlightActiveLine,
  type ViewUpdate,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches,getSearchQuery,findNext,findPrevious } from "@codemirror/search";
import {floatingSearchExtensions,configureFloatingSearch} from './searchTools';
import {useFileWorkspace} from '../files/WorkspaceContext';
import { markdown } from "@codemirror/lang-markdown";
import {
  HighlightStyle,
  syntaxHighlighting,
  bracketMatching,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { annotationHighlights } from "../annotations/annotationDecorations";
import {configureMarkdownDisplay,configureImageContext,markdownDisplayExtensions,displayModeField,setDisplayMode,type DisplayMode} from './markdownDisplay';
import {sourceMarkdownLanguage} from './sourceSyntax';
import {inlineFormatting,paragraphAlignment,type Alignment,type InlineFormat} from './formatting';
import {configureTypewriter,typewriterExtensions} from './typewriter';
import {usePanelActivity} from '../../shared/panelActivity';
import {deferredEditorSleep} from './editorSleep';

const colors = HighlightStyle.define([
  {
    tag: tags.heading1,
    color: "#f1ede2",
    fontWeight: "650",
  },
  {
    tag: tags.heading2,
    color: "#e6dfd0",
    fontWeight: "600",
  },
  { tag: tags.heading3, color: "#d7d0bd", fontWeight: "600" },
  { tag: tags.processingInstruction, color: "#716c59" },
  { tag: tags.emphasis, fontStyle: "italic", color: "#d1bb80" },
  { tag: tags.strong, fontWeight: "700", color: "#e5d8b6" },
  { tag: tags.link, color: "#c6b785" },
  { tag: tags.monospace, color: "#c6b785", backgroundColor: "#292b25" },
  { tag: tags.quote, color: "#92998d" },
]);
export function makeState(
  doc: string|Text,
  onUpdate: (u: ViewUpdate) => void,
  label = "Markdown 正文编辑器",
  displayMode:DisplayMode='live',
) {
  return EditorState.create({
    doc,
    extensions: [
      markdown({ base: sourceMarkdownLanguage }),
      annotationHighlights,
      markdownDisplayExtensions,
      displayModeField.init(()=>displayMode),
      floatingSearchExtensions,
      typewriterExtensions,
      EditorState.allowMultipleSelections.of(true),
      EditorState.phrases.of({Find:'查找',Replace:'替换',next:'下一处',previous:'上一处',all:'全部','match case':'区分大小写',regexp:'正则表达式','by word':'全词',replace:'替换','replace all':'全部替换',close:'关闭'}),
      history(),
      drawSelection(),
      highlightActiveLine(),
      bracketMatching(),
      highlightSelectionMatches(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap.filter(binding=>!['Mod-f','F3','Mod-g'].includes(binding.key||'')),
        indentWithTab,
      ]),
      syntaxHighlighting(colors),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        "aria-label": label,
        spellcheck: "false",
      }),
      EditorView.updateListener.of(onUpdate),
      EditorView.theme(
        {
          "&": {
            height: "100%",
            backgroundColor: "transparent",
            color: "#c6c8c0",
            fontSize: "var(--editor-font-size, 15px)",
          },
          ".cm-scroller": {
            fontFamily:
              '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif',
            lineHeight: "2.05",
            overflow: "auto",
          },
          ".cm-content": {
            padding: "12px 0 120px",
            caretColor: "#dcc486",
            maxWidth: "780px",
            margin: "0 auto",
            width: "100%",
          },
          ".cm-line": { padding: "2px 50px" },
          "&.cm-focused": { outline: "none" },
          ".cm-activeLine": { backgroundColor: "#ffffff02" },
          ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
            background: "#b99d4c38",
          },
          ".cm-cursor": { borderLeftColor: "#ddc68b" },
          ".cm-panels": {
            background: "#232623",
            color: "#d8d9d0",
            borderColor: "#393e36",
          },
          ".cm-searchMatch": { background: "#b99d4c3a" },
          ".cm-searchMatch-selected": { background: "#b99d4c70" },
          ".cm-textfield": {
            background: "#181b18",
            border: "1px solid #444b40",
            color: "#eee",
          },
          ".cm-button": {
            background: "#30362e",
            color: "#eee",
            border: "1px solid #48513f",
          },
          ".cm-tooltip": {
            background: "#252a24",
            color: "#eee",
            border: "1px solid #48513f",
          },
        },
        { dark: true },
      ),
    ],
  });
}
export default function Editor({
  onReady,
  onUpdate,
  onMarkSelection,
  onUnmarkSelection,
  onShowAnnotations,
  onError,
  onFocus,
  onFind,
  documentFile='',
  searchActive=false,
  typewriter=false,
  displayMode='live',
  annotationTool=false,
  initialState=null,
  keepAlive=false,
}: {
  onReady: (v: EditorView | null) => void;
  onUpdate: (u: ViewUpdate) => void;
  onMarkSelection?:()=>void;
  onUnmarkSelection?:(id?:string)=>void;
  onShowAnnotations?:(context:AnnotationContext)=>void;
  onError?:(message:string)=>void;
  onFocus?:()=>void;
  onFind?:()=>void;
  documentFile?:string;
  searchActive?:boolean;
  typewriter?:boolean;
  displayMode?:DisplayMode;
  annotationTool?:boolean;
  initialState?:EditorState|null;
  keepAlive?:boolean;
}) {
  const fileWorkspace=useFileWorkspace();
  const panelDocument=usePanelDocument();
  const host = useRef<HTMLDivElement>(null),
    callback = useRef(onUpdate);
  const editorRef=useRef<EditorView|null>(null),rightSelection=useRef<{selection:EditorSelection;doc:EditorState['doc']}|null>(null);
  const visible=usePanelActivity(),[retained,setRetained]=useState(visible),awake=visible||keepAlive||retained;
  const initial=useRef(initialState);initial.current=initialState;
  const nativeComposition=useRef(false),gestures=useRef(new Set<number>());
  const sleep=useRef<ReturnType<typeof deferredEditorSleep>|null>(null);
  useEffect(()=>{
    const controller=deferredEditorSleep({set:(callback,delay)=>setTimeout(callback,delay),clear:id=>clearTimeout(id as ReturnType<typeof setTimeout>)},()=>setRetained(false),()=>nativeComposition.current||gestures.current.size>0||!!editorRef.current?.composing);
    sleep.current=controller;controller.visible(visible||keepAlive);
    return()=>{controller.dispose();sleep.current=null;};
  },[]);
  useLayoutEffect(()=>{if(visible||keepAlive)setRetained(true);sleep.current?.visible(visible||keepAlive);},[visible,keepAlive]);
  useEffect(()=>{
    const element=host.current;if(!element||!awake)return;
    const start=()=>{nativeComposition.current=true;},end=()=>{nativeComposition.current=false;sleep.current?.released();};
    const down=(event:PointerEvent)=>{gestures.current.add(event.pointerId);};
    const up=(event:PointerEvent)=>{gestures.current.delete(event.pointerId);sleep.current?.released();};
    const blur=()=>{gestures.current.clear();sleep.current?.released();};
    const window=panelDocument.defaultView!;
    element.addEventListener('compositionstart',start,true);element.addEventListener('compositionend',end,true);element.addEventListener('pointerdown',down,true);
    window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',up,true);window.addEventListener('blur',blur);
    return()=>{element.removeEventListener('compositionstart',start,true);element.removeEventListener('compositionend',end,true);element.removeEventListener('pointerdown',down,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',up,true);window.removeEventListener('blur',blur);};
  },[panelDocument,awake]);
  const [context,setContext]=useState<{x:number;y:number;annotationId?:string;input?:HTMLTextAreaElement}|null>(null);
  callback.current = onUpdate;
  useAnnotationTool(editorRef,annotationTool&&awake,onMarkSelection);
  useLayoutEffect(() => {
    if(!awake)return;
    let restored=initial.current||makeState("", (u) => callback.current(u),undefined,displayMode);
    if(restored.field(displayModeField,false)!==displayMode)restored=restored.update({effects:setDisplayMode.of(displayMode)}).state;
    const view = new EditorView({
      state: restored,
      parent: host.current!,
    });
    editorRef.current=view;
    onReady(view);
    // Existing sessions keep their EditorState through Vite updates and pane remounts.
    configureMarkdownDisplay(view,displayMode);
    return () => {
      onReady(null);
      editorRef.current=null;
      view.destroy();
      rightSelection.current=null;setContext(null);
    };
  }, [onReady,awake]);
  useEffect(()=>{const view=editorRef.current;if(!view)return;view.setRoot(panelDocument);view.requestMeasure();view.dom.dispatchEvent(new Event('hive:panel-document-changed'));setContext(null);},[panelDocument,onReady,awake]);
  useEffect(()=>{
    const view=editorRef.current;if(!view)return;
    const handler=(event:Event)=>{const detail=(event as CustomEvent<{ranges:{from:number;to:number}[];action:'mark'|'unmark'}>).detail;
      if(!detail?.ranges?.length)return;
      const ranges=detail.ranges.filter(r=>r.from>=0&&r.to>r.from&&r.to<=view.state.doc.length).sort((a,b)=>a.from-b.from);
      if(!ranges.length)return;
      view.dispatch({selection:EditorSelection.create(ranges.map(r=>EditorSelection.range(r.from,r.to)))});
      if(detail.action==='mark')onMarkSelection?.();else if(detail.action==='unmark')onUnmarkSelection?.();
    };
    view.dom.addEventListener('hive:table-annotation',handler);return()=>view.dom.removeEventListener('hive:table-annotation',handler);
  },[onMarkSelection,onUnmarkSelection,awake]);
  useEffect(()=>{if(editorRef.current){configureMarkdownDisplay(editorRef.current,displayMode);configureTypewriter(editorRef.current,typewriter);configureFloatingSearch(editorRef.current,searchActive);configureImageContext(editorRef.current,documentFile?{file:documentFile,workspace:fileWorkspace.info.id}:null);}});
  return <><div className={'editor-host'+(annotationTool?' annotation-tool-active':'')} ref={host} onFocusCapture={onFocus}
    onPointerDownCapture={event=>{const editor=editorRef.current;if(event.button===2&&editor)rightSelection.current={selection:editor.state.selection,doc:editor.state.doc};}}
    onContextMenu={event=>{
      const editor=editorRef.current;if(!onMarkSelection||!editor)return;
      event.preventDefault();event.stopPropagation();const target=event.target as HTMLElement,input=target.tagName==='TEXTAREA'&&target.closest('[data-table-widget]')?target as HTMLTextAreaElement:undefined;const snapshot=rightSelection.current;rightSelection.current=null;
      if(!input&&snapshot&&snapshot.selection.ranges.some(range=>!range.empty)&&snapshot.doc===editor.state.doc)editor.dispatch({selection:snapshot.selection});
      setContext({x:event.clientX,y:event.clientY,input,annotationId:input?undefined:(event.target as Element).closest<HTMLElement>('[data-annotation-id]')?.dataset.annotationId});
    }}
    onKeyDownCapture={event=>{
      if(onFind&&(event.target as HTMLElement).closest('.cm-content')&&(event.key==='F3'||(event.ctrlKey||event.metaKey)&&!event.altKey&&['f','g','h'].includes(event.key.toLowerCase()))){
        event.preventDefault();event.stopPropagation();onFind();const editor=editorRef.current;
        if(editor&&(event.key==='F3'||event.key.toLowerCase()==='g')&&getSearchQuery(editor.state).valid)(event.shiftKey?findPrevious:findNext)(editor);return;
      }
      if((event.ctrlKey||event.metaKey)&&!event.altKey&&(event.target as HTMLElement).closest('.cm-content')){
        const key=event.key.toLowerCase(),inline:Record<string,InlineFormat>={b:'bold',i:'italic',u:'underline'},align:Record<string,Alignment>={l:'left',e:'center',r:'right'};
        const editor=editorRef.current;
        if(editor&&(!event.shiftKey&&inline[key]||event.shiftKey&&align[key])){
          event.preventDefault();event.stopPropagation();
          try{editor.dispatch(event.shiftKey?paragraphAlignment(editor.state,align[key]):inlineFormatting(editor.state,inline[key]));}
          catch(error){onError?.((error as Error).message);}
        }
      }
    }}
    onKeyDown={event=>{
      if(!onMarkSelection||!(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'))return;
      const editor=editorRef.current;if(!editor)return;event.preventDefault();event.stopPropagation();
      const point=editor.coordsAtPos(editor.state.selection.main.head),rect=editor.dom.getBoundingClientRect();
      const target=event.target as HTMLElement,input=target.tagName==='TEXTAREA'&&target.closest('[data-table-widget]')?target as HTMLTextAreaElement:undefined;const inputRect=input?.getBoundingClientRect();setContext({x:inputRect?.left??point?.left??rect.left+12,y:inputRect?.bottom??point?.bottom??rect.top+20,input});
    }}/>
    {awake&&context&&editorRef.current&&onMarkSelection&&<EditorContextMenu editor={editorRef.current} point={context} input={context.input} onClose={()=>setContext(null)} onMark={onMarkSelection} onUnmark={onUnmarkSelection} annotationId={context.annotationId} onShowAnnotations={onShowAnnotations} onError={onError}/>}</>;
}
