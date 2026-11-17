import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {usePanelDocument} from '../../shared/panelDocument';
import { EditorState, EditorSelection, StateEffect, Prec, Compartment, type Text } from "@codemirror/state";
import {linkAt} from './linkNavigation';
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
  indentWithTab, undo, redo,
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
import {configureMarkdownDisplay,configureImageContext,markdownDisplayExtensions,displayModeField,setDisplayMode} from './markdownDisplay';
import {sourceMarkdownLanguage} from './sourceSyntax';
import {fencedCodeHighlight,fencedCodeLanguage} from './codeHighlight';
import {inlineFormatting,paragraphAlignment,type Alignment,type InlineFormat} from './formatting';
import {configureTypewriter,typewriterExtensions} from './typewriter';
import {usePanelActivity} from '../../shared/panelActivity';
import {deferredEditorSleep} from './editorSleep';
import {configureTypography,typographyExtensions} from '../typography/typographyExtension';
import {type EditorDisplayMode, underlyingDisplayMode, synchronizeScroll, sourceTransaction, mirrorTransaction} from './splitView';
import './split-view.css';
import {headingFolding,foldingEffects,isFoldingEffect,foldingMarker} from './headingFolding';
import './headingFolding.css';
import {codeModeExtensions,codeModeMarker} from './codeMode';
import {projectedBreaks,projectedBreakGaps,virtualLineWindow,splitPadding,setSplitPadding,splitTopPadding,setSplitTopPadding,splitBlockPadding,setSplitBlockPadding,alignSplitViews} from './splitAlignment';

const colors = HighlightStyle.define([
  {tag:tags.heading1,class:'cm-markdown-h1'},
  {tag:tags.heading2,class:'cm-markdown-h2'},
  {tag:tags.heading3,class:'cm-markdown-h3'},
  {tag:tags.heading4,class:'cm-markdown-h4'},
  {tag:tags.heading5,class:'cm-markdown-h5'},
  {tag:tags.heading6,class:'cm-markdown-h6'},
  { tag: tags.processingInstruction, color: "var(--hive-document-text, var(--text))" },
  { tag: tags.emphasis, fontStyle: "italic", color: "var(--hive-document-text, var(--text))" },
  { tag: tags.strong, fontWeight: "700", color: "var(--hive-document-text, var(--text))" },
  { tag: tags.link, color: "var(--hive-editor-link-text)", textDecoration: "underline" },
  { tag: tags.monospace, color: "var(--hive-document-text, var(--text))", backgroundColor: "color-mix(in srgb, var(--hive-document-text) 5%, transparent)" },
  { tag: tags.quote, color: "var(--hive-document-text, var(--text))" },
]);
export function makeState(
  doc: string|Text,
  onUpdate: (u: ViewUpdate) => void,
  label = "Markdown 正文编辑器",
  displayMode:EditorDisplayMode='live',
) {
  return EditorState.create({
    doc,
    extensions: [
      markdown({ base: sourceMarkdownLanguage, codeLanguages:fencedCodeLanguage }),
      annotationHighlights,
      markdownDisplayExtensions,
      headingFolding,
      displayModeField.init(()=>underlyingDisplayMode(displayMode)),
      floatingSearchExtensions,
      typewriterExtensions,
      typographyExtensions,
      projectedBreakGaps,
      projectedBreaks,
      virtualLineWindow,
      codeModeExtensions,
      splitPadding,
      splitTopPadding,
      splitBlockPadding,
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
      fencedCodeHighlight,
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
            color: "var(--hive-document-text, var(--text))",
            fontSize: "var(--editor-font-size, 15px)",
          },
          ".cm-scroller": {
            fontFamily:
              '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif',
            overflow: "auto",
          },
          ".cm-content": {
            padding: "12px 0 120px",
            caretColor: "var(--hive-document-text, var(--text))",
            margin: "0 auto",
            width: "100%",
          },
          ".cm-line": { padding: "2px 50px" },
          "&.cm-focused": { outline: "none" },
          ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--hive-document-text) 2%, transparent)" },
          ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
            background: "var(--hive-selection-bg)",
          },
          ".cm-cursor": { borderLeftColor: "var(--hive-document-text, var(--text))" },
          ".cm-panels": {
            background: "var(--hive-popup-bg, var(--panel))",
            color: "var(--hive-popup-text, var(--text))",
            borderColor: "var(--hive-popup-border, var(--line))",
          },
          ".cm-searchMatch": { background: "color-mix(in srgb, var(--hive-accent) 23%, transparent)" },
          ".cm-searchMatch-selected": { background: "color-mix(in srgb, var(--hive-accent) 44%, transparent)" },
          ".cm-textfield": {
            background: "var(--hive-input-bg, var(--bg))",
            border: "1px solid var(--hive-input-border, var(--line))",
            color: "var(--hive-popup-text, var(--text))",
          },
          ".cm-button": {
            background: "var(--hive-input-bg, var(--panel))",
            color: "var(--hive-popup-text, var(--text))",
            border: "1px solid var(--hive-popup-border, var(--line))",
          },
          ".cm-tooltip": {
            background: "var(--hive-popup-bg, var(--panel))",
            color: "var(--hive-popup-text, var(--text))",
            border: "1px solid var(--hive-popup-border, var(--line))",
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
  onOpenLink,
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
  onOpenLink?:(target:string)=>void;
  documentFile?:string;
  searchActive?:boolean;
  typewriter?:boolean;
  displayMode?:EditorDisplayMode;
  annotationTool?:boolean;
  initialState?:EditorState|null;
  keepAlive?:boolean;
}) {
  const fileWorkspace=useFileWorkspace();
  const panelDocument=usePanelDocument();
  const host = useRef<HTMLDivElement>(null),
    callback = useRef(onUpdate);
  const mainHost=useRef<HTMLDivElement>(null),sourceHost=useRef<HTMLDivElement>(null),sourceRef=useRef<EditorView|null>(null);
  const resetSource=useRef<((state:EditorState)=>void)|null>(null),sourceReadOnly=useRef(new Compartment());
  const alignmentRef=useRef<ReturnType<typeof alignSplitViews>|null>(null);
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
  const [context,setContext]=useState<{x:number;y:number;annotationId?:string;input?:HTMLTextAreaElement;link?:string}|null>(null);
  callback.current = onUpdate;
  useAnnotationTool(editorRef,annotationTool&&awake,onMarkSelection);
  useLayoutEffect(() => {
    if(!awake)return;
    let restored=initial.current||makeState("", (u) => callback.current(u),undefined,displayMode);
    if(!restored.field((foldingMarker),false))restored=restored.update({effects:StateEffect.appendConfig.of(headingFolding)}).state;
    if(!restored.field(codeModeMarker,false))restored=restored.update({effects:StateEffect.appendConfig.of(codeModeExtensions)}).state;
    if(restored.field(displayModeField,false)!==underlyingDisplayMode(displayMode))restored=restored.update({effects:setDisplayMode.of(underlyingDisplayMode(displayMode))}).state;
    const view = new EditorView({
      state: restored,
      parent: mainHost.current!,
      dispatchTransactions(transactions, view){
        view.update(transactions);
        const source=sourceRef.current;
        if(source){
          for(const tr of transactions)source.update([mirrorTransaction(source.state,tr)]);
          if(source.state.readOnly!==view.state.readOnly)source.update([source.state.update({effects:sourceReadOnly.current.reconfigure([EditorState.readOnly.of(view.state.readOnly),EditorView.editable.of(!view.state.readOnly)])})]);
        }
        if(transactions.some(tr=>!tr.effects.some(effect=>(effect.is(setSplitPadding)||effect.is(setSplitTopPadding)||effect.is(setSplitBlockPadding)))))alignmentRef.current?.schedule();
      },
    });
    // File replacement uses setState, which does not dispatch transactions.
    const setState=view.setState.bind(view);
    view.setState=(state)=>{setState(state);resetSource.current?.(view.state);const missing=[...(view.state.field(foldingMarker,false)?[]:[headingFolding]),...(view.state.field(codeModeMarker,false)?[]:[codeModeExtensions]),...(sourceRef.current&&!view.state.field(splitPadding,false)?[splitPadding]:[]),...(sourceRef.current&&!view.state.field(splitTopPadding,false)?[splitTopPadding]:[]),...(sourceRef.current&&!view.state.field(splitBlockPadding,false)?[splitBlockPadding]:[])];if(missing.length)view.dispatch({effects:StateEffect.appendConfig.of(missing)});};
    editorRef.current=view;
    onReady(view);
    // Existing sessions keep their EditorState through Vite updates and pane remounts.
    configureMarkdownDisplay(view,underlyingDisplayMode(displayMode));
    configureTypography(view);
    return () => {
      alignmentRef.current?.dispose();alignmentRef.current=null;
      if(view.state.field(splitPadding,false)?.size||view.state.field(splitTopPadding,false)?.size||view.state.field(splitBlockPadding,false)?.size)view.dispatch({effects:[setSplitPadding.of(new Map()),setSplitTopPadding.of(new Map()),setSplitBlockPadding.of(new Map())]});
      onReady(null);
      editorRef.current=null;
      view.destroy();
      rightSelection.current=null;setContext(null);
    };
  }, [onReady,awake]);
  useEffect(()=>{const view=editorRef.current;if(!view)return;view.setRoot(panelDocument);sourceRef.current?.setRoot(panelDocument);view.requestMeasure();sourceRef.current?.requestMeasure();view.dom.dispatchEvent(new Event('hive:panel-document-changed'));setContext(null);},[panelDocument,onReady,awake]);
  useLayoutEffect(()=>{
    const main=editorRef.current, parent=sourceHost.current;
    if(!awake||displayMode!=='split'||!main||!parent)return;
    const makeSourceState=(mainState:EditorState)=>{
      let state=makeState(mainState.doc,()=>{},'Markdown 源码','source');
      state=state.update({selection:mainState.selection,effects:[...foldingEffects(mainState),StateEffect.appendConfig.of([sourceReadOnly.current.of([EditorState.readOnly.of(mainState.readOnly),EditorView.editable.of(!mainState.readOnly)]),Prec.highest(keymap.of([
        {key:'Mod-z',run:()=>undo(main)}, {key:'Mod-Shift-z',run:()=>redo(main)}, {key:'Mod-y',run:()=>redo(main)},
      ]))])]}).state;
      return state;
    };
    const state=makeSourceState(main.state);
    const source=new EditorView({state,parent,dispatchTransactions(transactions){
      for(const tr of transactions){
        if(main.state.readOnly&&tr.docChanged)continue;
        main.dispatch(sourceTransaction(tr));
        // View-local effects (including explicit scrollIntoView) belong to the
        // source view; its changes and selection were already mirrored above.
        const localEffects=tr.effects.filter(effect=>!isFoldingEffect(effect));
        if(localEffects.length||tr.scrollIntoView)source.update([source.state.update({effects:localEffects,scrollIntoView:tr.scrollIntoView})]);
        if(tr.scrollIntoView)alignmentRef.current?.reveal(tr.newSelection.main.head);
      }
    }});
    sourceRef.current=source;
    resetSource.current=state=>{source.setState(makeSourceState(state));source.requestMeasure();alignmentRef.current?.schedule();};
    if(!main.state.field(splitPadding,false)||!main.state.field(splitTopPadding,false)||!main.state.field(splitBlockPadding,false))main.dispatch({effects:StateEffect.appendConfig.of([...(main.state.field(splitPadding,false)?[]:[splitPadding]),...(main.state.field(splitTopPadding,false)?[]:[splitTopPadding]),...(main.state.field(splitBlockPadding,false)?[]:[splitBlockPadding])])});
    const detach=synchronizeScroll(source,main),alignment=alignSplitViews(source,main,detach.correct);alignmentRef.current=alignment;
    return()=>{alignmentRef.current=null;alignment.dispose();detach();if(main.state.field(splitPadding,false)?.size||main.state.field(splitTopPadding,false)?.size||main.state.field(splitBlockPadding,false)?.size)main.dispatch({effects:[setSplitPadding.of(new Map()),setSplitTopPadding.of(new Map()),setSplitBlockPadding.of(new Map())]});resetSource.current=null;sourceRef.current=null;source.destroy();};
  },[awake,displayMode,onReady,panelDocument]);
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
  useEffect(()=>{if(editorRef.current){configureMarkdownDisplay(editorRef.current,underlyingDisplayMode(displayMode));configureTypewriter(editorRef.current,typewriter);configureFloatingSearch(editorRef.current,searchActive);configureImageContext(editorRef.current,documentFile?{file:documentFile,workspace:fileWorkspace.info.id}:null);}});
  return <><div className={'editor-host'+(displayMode==='split'?' split-view':'')+(annotationTool?' annotation-tool-active':'')} ref={host} onFocusCapture={onFocus}
    onPointerDownCapture={event=>{const editor=editorRef.current;if(event.button===2&&editor)rightSelection.current={selection:editor.state.selection,doc:editor.state.doc};}}
    onContextMenu={event=>{
      const editor=editorRef.current;if(!onMarkSelection||!editor)return;
      event.preventDefault();event.stopPropagation();const target=event.target as HTMLElement,input=target.tagName==='TEXTAREA'&&target.closest('[data-table-widget]')?target as HTMLTextAreaElement:undefined;const snapshot=rightSelection.current;rightSelection.current=null;
      if(!input&&snapshot&&snapshot.selection.ranges.some(range=>!range.empty)&&snapshot.doc===editor.state.doc)editor.dispatch({selection:snapshot.selection});
      const tableLink=target.closest<HTMLElement>('[data-hive-link]')?.dataset.hiveLink;
      const pos=editor.posAtCoords({x:event.clientX,y:event.clientY});
      const link=tableLink||(!input&&pos!==null?linkAt(editor.state,pos):undefined);
      setContext({x:event.clientX,y:event.clientY,input,link,annotationId:input?undefined:(event.target as Element).closest<HTMLElement>('[data-annotation-id]')?.dataset.annotationId});
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
    }}><div className="split-source" ref={sourceHost}/><div className="split-main" ref={mainHost}/></div>
    {awake&&context&&editorRef.current&&onMarkSelection&&<EditorContextMenu editor={editorRef.current} point={context} input={context.input} link={context.link} onOpenLink={onOpenLink} onClose={()=>setContext(null)} onMark={onMarkSelection} onUnmark={onUnmarkSelection} annotationId={context.annotationId} onShowAnnotations={onShowAnnotations} onError={onError}/>}</>;
}
