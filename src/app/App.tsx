import ImageFileView from '../features/files/ImageFileView';
import {retireDeletedImage} from '../features/files/imageSession';
import {resolveLinkTarget} from '../features/editor/linkNavigation';
import {useApplyTheme} from '../features/theme/applyTheme';
import {flushThemeFiles} from '../features/theme/templateFiles';
import {flushThemePreferences} from '../features/theme/themeStore';
import {applyStoredDocumentChange,mapStoredSessionContext} from '../features/editor/storedDocumentChanges';
import type {Transaction} from '@codemirror/state';
import {captureEditorView} from '../features/editor/editorViewSnapshot';
import {requestApi} from './api';
import type {DiskFile} from '../shared/fileTypes';
import {hello,type Message} from '../features/chat/chatTypes';
import type {EditorSession} from '../features/editor/editorSessionTypes';
import type {Dialog} from '../features/editor/editorDialogTypes';
import {useDocumentPersistence} from '../features/files/useDocumentPersistence';
import {useFileActions} from '../features/files/useFileActions';
import {useViewSnapshots} from '../features/workspace/useViewSnapshots';
import {PanelFrame,PanelControls,emptyPanelFooter,type PanelChrome} from '../features/workspace/PanelFrame';
import {AppHeader} from './AppHeader';
import {useAnnotationActions} from '../features/annotations/useAnnotationActions';
import {generateWriting,stopWritingGeneration,type GenerationOptions} from '../features/chat/writingGeneration';
import {createProposalActions} from '../features/chat/proposalActions';
import {runEditorCommand} from '../features/ribbon/editorCommands';
// Load the complete style stack with App, including in already-open Vite sessions.
import "./styles.css";
import "../features/annotations/annotations.css";
import "../features/workspace/workbench-v3.css";
import "../features/workspace/free-workspace.css";
import "../features/workspace/panel-chrome.css";
import "../features/editor/editor-tabs.css";
import {documentMatchesText} from '../features/editor/documentText';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {WorkspaceProvider, useFileWorkspace, type WorkspaceInfo} from "../features/files/WorkspaceContext";
import type {AnnotationContext} from '../features/editor/EditorContextMenu';
import EditorStatusBar, {useStatusPreferences} from "../features/editor/EditorStatusBar";
import "../features/files/files.css";
import TrashPanel from '../features/files/TrashPanel';
import RepositoryPanel from '../features/files/RepositoryPanel';
import FileExplorer from "../features/files/FileExplorer";
import FilePicker from '../features/files/FilePicker';
import {readRecentDocuments,rememberRecentDocument} from '../features/files/recentDocuments';
import NewTabPage,{NewTabButton} from '../features/editor/NewTabPage';
import {flattenEntries,type Entry} from "../features/files/explorerState";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { EditorSelection, type EditorState } from "@codemirror/state";
import {
  ArrowLeft,
  BookOpen,
  CheckCheck,
  ChevronRight,
  FileText,
  FolderOpen,
  Highlighter,
  ListTree,
  Lock,
  ListPlus,
  MessageSquare,
  PencilLine,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import Editor,{rebindDocumentUpdates} from "../features/editor/Editor";
import type {InlineProposal} from "../features/editor/proposalInline";
import {ProposalOverlay} from "../features/editor/ProposalOverlay";
import DisplayModeControl from '../features/editor/DisplayModeControl';
import {prepareDocumentTabClose} from '../features/editor/closeDocumentTab';
import FindReplacePanel from '../features/editor/FindReplacePanel';
import NotePropertiesPanel from '../features/editor/NotePropertiesDialog';
import EditorInsertDialog,{type InsertTarget} from '../features/editor/EditorInsertDialog';
import TableOfContents from '../features/outline/TableOfContentsPanel';
import type {RibbonCommand} from '../features/ribbon/Ribbon';
import Ribbon from "../features/ribbon/Ribbon";
import WritingOutline from "../features/outline/WritingOutlineV2";
import { targetForNode } from "../features/outline/writingNodes";
import { useWritingNodes } from "../features/outline/useWritingNodes";
import { usePanelWorkspace } from "../features/workspace/usePanelWorkspace";
import PanelControl from "../features/workspace/PanelControl";
import ViewControls from "../features/workspace/ViewControls";
import PanelIconRail from "../features/workspace/PanelIconRail";
import type {DockEdge} from "../features/workspace/panelLayout";
import WritingModeControl from "../features/chat/WritingModeControl";
import GlobalToolbar from "../features/chat/GlobalToolbar";
import {useReferenceSources,type ReferenceSource} from '../features/chat/referenceSources';
import {useModelReasoning} from '../features/chat/modelReasoning';
import ChatComposer from "../features/chat/ChatComposer";
import InputBasisPanel,{type InputBasisRequest} from '../features/chat/InputBasisPanel';
import WorkspaceTabs from "../features/workspace/WorkspaceTabs";
import RailEdgeHandle from "../features/workspace/RailEdgeHandle";
import SettingsPage, {type SettingsSection} from "../features/settings/SettingsPage";
import {initialConfig, parseModelChoice, selectedModelEntry, type Config, type ModelProbeRequest, type ModelProbeResult} from "../features/settings/modelConfig";
import { useAppearance } from "../features/settings/useAppearance";
import {useAnnotationPreferences} from '../features/settings/useAnnotationPreferences';
import {usePanelIconDragPreferences} from '../features/settings/usePanelIconDragPreferences';
import InlineAnnotationEditor, {
  type InlineAnnotationRequest,
} from "../features/annotations/InlineAnnotationEditor";
import ScratchPad from "../features/scratch/ScratchPad";
import { useTextAnnotations } from "../features/annotations/useTextAnnotations";
import AnnotationPanel from "../features/annotations/AnnotationPanel";
import FloatingOrb from "../features/chat/FloatingOrb";
import { createPortal } from 'react-dom';
import { DesktopPanel, DesktopPanelsProvider, useDesktopPanels } from '../features/workspace/DesktopPanels';
import {
  type AnnotationSource,
  type TextAnnotation,
} from "../features/annotations/annotations";
import {
  canApplyToDocument,
  previewIntact,
  headings,
  mapAnchor,
  minimalReplacement,
  modeLabels,
  type Anchor,
  type Mode,
  type Proposal,
  type UndoEdit,
} from "../shared/core";

const uid = () => crypto.randomUUID();

export default function App() {
  useApplyTheme();
  const [info,setInfo]=useState<WorkspaceInfo|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let alive=true;fetch('/api/workspace').then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);if(alive){setInfo(data);setError('');}}).catch(error=>{if(alive)setError(error.message);});return()=>{alive=false;};},[attempt]);
  if(!info)return <div className="workspace-loading" role="status">{error||'正在打开写作空间…'}{error&&<button onClick={()=>setAttempt(value=>value+1)}>重试</button>}</div>;
  return <WorkspaceProvider key={info.id} info={info} onChange={setInfo}><DesktopPanelsProvider><WritingApp/></DesktopPanelsProvider></WorkspaceProvider>;
}
function WritingApp() {
  const desktopPanels = useDesktopPanels();
  const closing = useRef(false);
  const [closingWindow,setClosingWindow] = useState(false);
  const fileWorkspace=useFileWorkspace(),request=fileWorkspace.request;
  const api=<T,>(url:string,body?:unknown)=>requestApi<T>(request,url,body);
  const statusPreferences=useStatusPreferences();
  const switching=useRef(false),structuring=useRef(false);

  const workbenchRef = useRef<HTMLDivElement>(null);
  const appearanceSettings=useAppearance();
  const annotationPreferences=useAnnotationPreferences();
  const panelIconDragPreferences=usePanelIconDragPreferences();
  const workspace = usePanelWorkspace(workbenchRef, id => {if(sessions.current.has(id))activateEditor(id);},28*appearanceSettings.appearance.uiScale/100,appearanceSettings.appearance.panelLockGesture);
  const sessions = useRef(new Map<string, EditorSession>([["editor", {id:"editor",disk:null,state:null,view:null,dirty:false,landing:true}]]));
  const [recentOpen,setRecentOpen]=useState(false),[newNoteBusy,setNewNoteBusy]=useState(false),[renameRequest,setRenameRequest]=useState<{path:string;key:string}>();
  const creatingNote=useRef(false);
  const activeSession = useRef("editor"), syncingSessions = useRef(false);
  const [activeEditorId, setActiveEditorId] = useState("editor");
  const sessionCallbacks = useRef({update: (_id: string, _update: ViewUpdate) => {}, ready: (_id: string, _view: EditorView | null) => {},prepareScratch:null as (()=>Promise<boolean>)|null});
  const sessionBindings = useRef(new Map<string, {onUpdate:(update:ViewUpdate)=>void;onReady:(view:EditorView|null)=>void}>());
  const sessionScrollBindings=useRef(new Map<string,()=>void>());
  function bindings(id: string) {
    if (!sessionBindings.current.has(id)) sessionBindings.current.set(id, {onUpdate: update => sessionCallbacks.current.update(id, update), onReady: view => sessionCallbacks.current.ready(id, view)});
    return sessionBindings.current.get(id)!;
  }
  const editorIds = [...sessions.current.keys()];
  const canDetachDocumentTab=desktopPanels.enabled&&editorIds.filter(id=>workspace.isOpen(id)).length>=2;
  function panelLabel(id:string) {
    if(sessions.current.has(id))return sessions.current.get(id)?.landing?'新标签页':(sessions.current.get(id)?.imagePath||sessions.current.get(id)?.disk?.path)?.split('/').at(-1)||'未命名稿';
    return ({files:'文档',repositories:'仓库管理',conversation:'对话',outline:'大纲',toc:'标题目录',scratch:'草稿',annotations:'标注',basis:'依据',search:'查找替换',trash:'回收站',properties:'笔记属性'} as Record<string,string>)[id]||id;
  }
  const leftPanel = workspace.panel("files"), rightPanel = workspace.panel("conversation");
  const leftOpen = workspace.isOpen("files"), chatOpen = workspace.isOpen("conversation");
  const [focusFileSearch,setFocusFileSearch]=useState(false);
  useEffect(()=>{
    if(!focusFileSearch)return;
    const input=leftPanel.ref.current?.querySelector<HTMLInputElement>('input[aria-label="筛选文件"]');
    if(!input?.isConnected||input.disabled||!input.getClientRects().length)return;
    if(input.ownerDocument!==document)desktopPanels.focus('files');
    input.focus({preventScroll:true});
    setFocusFileSearch(false);
  });
  const setChatOpen = (value: boolean) => value ? workspace.open("conversation") : workspace.close("conversation");
  const editorState = useRef<EditorState | null>(null);
  const scratchView = useRef<EditorView | null>(null),
    activeTextSource = useRef<AnnotationSource>("document"),
    orbBounds = useRef({ width: 344, height: 520 });
  const orbPosition = useRef<{ x: number; y: number } | undefined>(undefined);
  const view = useRef<EditorView | null>(null),
    disk = useRef<DiskFile | null>(null),
    proposal = useRef<Proposal | null>(null),
    undo = useRef<UndoEdit[]>([]),
    requestAnchor = useRef<Anchor | null>(null);
  const controller = useRef<AbortController | null>(null),
    generation = useRef(0),
    running = useRef(false);
  const promptRef = useRef<HTMLTextAreaElement>(null),
    importRef = useRef<HTMLInputElement>(null),
    messagesEnd = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState<Entry[]>([]),
    [root, setRoot] = useState(""),
    [file, setFile] = useState(""),
    [dirty, setDirty] = useState(false),
    [tick, setTick] = useState(0);
  useEffect(()=>{if(file)rememberRecentDocument(fileWorkspace.info.id,file);},[fileWorkspace.info.id,file]);
  const [scratchReady, setScratchReady] = useState(0);
  const [annotationTool,setAnnotationTool]=useState(false);
  useEffect(()=>{
    if(!annotationTool)return;
    const cancel=(event:KeyboardEvent)=>{if(event.key==='Escape')setAnnotationTool(false);};
    const documents=[document,...[...desktopPanels.windows.values()].map(popup=>popup.document)];
    documents.forEach(doc=>doc.addEventListener('keydown',cancel));return()=>documents.forEach(doc=>doc.removeEventListener('keydown',cancel));
  },[annotationTool,desktopPanels.windows]);
  const [chatTab, setChatTab] = useState<"conversation" | "annotations">(
      "conversation",
    ),
    [annotationInstruction, setAnnotationInstruction] = useState(""),
    [annotationFocus, setAnnotationFocus] = useState<{id:string;nonce:number}|null>(null),
    [chatOrb, setChatOrb] = useState(false);
  const [outline, setOutline] = useState<ReturnType<typeof headings>>([]),
    [selection, setSelection] = useState({ from: 0, to: 0, text: "" }),
    [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState(""),[trashRevision,setTrashRevision]=useState(0);
  const [writingNodeId, setWritingNodeId] = useState<string | null>(null),
    [inlineRequest, setInlineRequest] =
      useState<InlineAnnotationRequest | null>(null);
  // The conversation lives for the mounted workspace. Only document review
  // state is transferred with editor activation and closure.
  const [mode, setMode] = useState<Mode>("discuss"),
    [prompt, setPrompt] = useState(""),
    [messages, setMessages] = useState<Message[]>([hello]),
    [busy, setBusy] = useState(false),
    [stream, setStream] = useState(""),
    [lastRequest, setLastRequest] = useState<InputBasisRequest|null>(null);
  const currentMode=useRef(mode),viewApplying=useRef(false),appAlive=useRef(true);currentMode.current=mode;
  useEffect(()=>{appAlive.current=true;return()=>{appAlive.current=false;};},[]);
  const [config, setConfig] = useState<Config>(initialConfig),
    [settings, setSettings] = useState(false),
    [settingsSection, setSettingsSection] = useState<SettingsSection>('models'),
    [settingsRestoreKey, setSettingsRestoreKey] = useState(0),
    [configBusy, setConfigBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [help, setHelp] = useState(false);
  const [fileBusy, setFileBusy] = useState(false),
    [confirm, setConfirm] = useState<{
      text: string;
      action: () => void;
    } | null>(null);
  const references=useReferenceSources(fileWorkspace.info.id,file||'@'+activeEditorId);
  const reasoning=useModelReasoning(!config.demo?config.selection:null,!config.demo?selectedModelEntry(config):undefined);
  function addReference(source:ReferenceSource){void addReferenceBatch([source]).then(results=>{const failed=results.filter(item=>!item.ok);if(failed.length)setError(failed.map(item=>item.path+'：'+item.error).join('；'));}).catch(error=>setError((error as Error).message));}
  const annotations = useTextAnnotations(
    file,
    view,
    scratchView,
    scratchReady,
    setError,
  );
  const {markText,showLocalAnnotation,unmarkText,locateAnnotation,reanchorAnnotation,sendAnnotations}=useAnnotationActions({
    annotations,view,scratchView,activeTextSource,disk,file,activeSession,workspace,chooseSidebar,setError,setInlineRequest,setAnnotationFocus:id=>setAnnotationFocus({id,nonce:Date.now()}),generate,openChat,annotationInstruction,
  });
  const writingOutline = useWritingNodes(/\.md$/i.test(file)?file:'', view, setError);
  const redraw = () => setTick((t) => t + 1);
  const {captureView,applyView}=useViewSnapshots({
    workspace,sessions,activeSession,bindings,activateEditor,api,
    appearance:appearanceSettings,statusPreferences,mode,currentMode,appAlive,viewApplying,running,switching,
    fileBusy,filter,setFilter,collapsed,setCollapsed,chatOrb,setChatOrb,orbPosition,orbBounds,redraw,
  });
  const chrome:PanelChrome={workspace,sessions,editorIds,panelLabel,closeEditor,minimizeEditor,activateEditor,redraw,activeTextSource,ribbonCommand};
  const inform = (text: string) => {
    setNotice(text);
  };
  const add = (role: Message["role"], content: string) =>
    setMessages((ms) => [...ms, { id: uid(), role, content }]);
  const dialogRef=useRef(dialog);dialogRef.current=dialog;
  function handleStoredChange(id:string,transaction:Transaction,mapAnnotations=true){
    const path=sessions.current.get(id)?.disk?.path;if(path&&mapAnnotations)annotations.mapStoredDocument(path,transaction);
    if(activeSession.current!==id)return;
    const derived=applyStoredDocumentChange({editorState,proposal,requestAnchor,undo},transaction);
    if(derived){setOutline(derived.outline);setSelection(derived.selection);}
  }
  // 建议只是正文里的预览，落盘时机必须由用户自己决定：有未确认的建议就不存盘。
  const proposalFor = useCallback((id: string) => id === activeSession.current ? proposal.current : sessions.current.get(id)?.context?.proposal ?? null, []);
  const pendingProposal = useCallback((id: string) => {
    if(proposalFor(id))return true;
    const path=sessions.current.get(id)?.disk?.path;
    return !!path&&[...sessions.current.values()].some(session=>session.disk?.path===path&&proposalFor(session.id));
  }, [proposalFor]);
  const reviewTarget=useRef<string|null>(null);
  function revealProposal(id:string,editor:EditorView){
    const pending=proposalFor(id);
    if(!pending)return;
    const position=Math.max(0,Math.min(pending.from,editor.state.doc.length));
    editor.dispatch({effects:EditorView.scrollIntoView(position,{y:'center'})});
  }
  const {savingPaths,fileConflicts,saveSession,applyDiskFile}=useDocumentPersistence({api,appAlive,workspace:fileWorkspace.info,sessions,activeSession,disk,switching,structuring,fileBusy,tick,autoSave:fileWorkspace.info.autoSave,pendingProposal,setDirty,setFileBusy,setEntries,setError,inform,redraw,onStoredChange:handleStoredChange});
  const onUpdate = useCallback((update: ViewUpdate) => {
    editorState.current = update.state;
    annotations.map("document", update);
    if(update.selectionSet&&update.view.hasFocus)activeTextSource.current='document';
    if (update.docChanged) {
      if (proposal.current)
        proposal.current = mapAnchor(proposal.current, update.changes);
      if (requestAnchor.current)
        requestAnchor.current = mapAnchor(
          requestAnchor.current,
          update.changes,
        );
      undo.current = undo.current.map((a) => mapAnchor(a, update.changes));
      setDirty(sessions.current.get(activeSession.current)!.dirty);
      setOutline(headings(update.state));
      setTick((t) => t + 1);
    }
    if (update.docChanged || update.selectionSet) {
      if(update.selectionSet&&!update.docChanged)redraw();
      const s = update.state.selection.main;
      setSelection({
        from: s.from,
        to: s.to,
        text: update.state.sliceDoc(s.from, s.to),
      });
    }
  }, []);
  const onScratchEditor = useCallback((editor: EditorView | null,save?:()=>Promise<boolean>) => {
    scratchView.current = editor;
    sessionCallbacks.current.prepareScratch=save||null;
    if (editor) setScratchReady((value) => value + 1);
  }, []);
  const onScratchUpdate = useCallback((update: ViewUpdate) => {
    annotations.map("scratch", update);
    if(update.selectionSet&&update.view.hasFocus)activeTextSource.current='scratch';
    if(update.docChanged||update.selectionSet)redraw();
  }, []);
  function ribbonCommand(command:RibbonCommand){
    if(command==='properties'){workspace.open('properties');return;}
    const source=activeTextSource.current,editor=source==='scratch'?scratchView.current:view.current;
    if(!editor)return;
    const id=activeSession.current,path=source==='scratch'?'自由草稿.md':sessions.current.get(id)?.disk?.path||'';
    const target:InsertTarget={editor,file:path,valid:()=>source==='scratch'?scratchView.current===editor:sessions.current.get(id)?.view===editor&&(sessions.current.get(id)?.disk?.path||'')===path,...(source==='scratch'?{prepare:async()=>await sessionCallbacks.current.prepareScratch?.()||false}:{})};
    runEditorCommand(command,{target,onDialog:setDialog,onError:setError,openSearch:()=>{workspace.open('search');requestAnimationFrame(()=>{const input=document.querySelector<HTMLInputElement>('[data-find-input]');input?.focus();input?.select();});}});
  }
  sessionCallbacks.current.ready = (id, next) => {
    const session = sessions.current.get(id)!;
    if (!next && session.view) captureEditorView(session);
    sessionScrollBindings.current.get(id)?.();sessionScrollBindings.current.delete(id);
    session.view = next;
    if(next)session.state=next.state;
    if(next){
      const top=session.restoreScroll,left=session.restoreScrollLeft,window=next.dom.ownerDocument.defaultView!;
      const remember=()=>captureEditorView(session);next.scrollDOM.addEventListener('scroll',remember);
      let frame:number|undefined;
      if(top!==undefined||left!==undefined||reviewTarget.current===id)frame=window.requestAnimationFrame(()=>{
        if(session.view!==next)return;
        if(reviewTarget.current===id){
          reviewTarget.current=null;
          if(activeSession.current===id){revealProposal(id,next);return;}
        }
        next.scrollDOM.scrollTop=top||0;next.scrollDOM.scrollLeft=left||0;
      });
      sessionScrollBindings.current.set(id,()=>{next.scrollDOM.removeEventListener('scroll',remember);if(frame!==undefined)window.cancelAnimationFrame(frame);});
    }
    if (activeSession.current === id) { view.current = next; editorState.current = session.state; if(next){annotations.syncEditor("document",next,session.disk?.path);setScratchReady(value=>value+1);} }
  };
  sessionCallbacks.current.update = (id, update) => {
    const session = sessions.current.get(id)!;
    session.state = update.state;
    if(update.docChanged)session.contentVersion=(session.contentVersion||0)+1;
    if(update.docChanged)session.dirty = !documentMatchesText(update.state.doc,session.disk?.text || "");
    if (update.docChanged && !syncingSessions.current && session.disk) {
      syncingSessions.current = true;
      try {
        for (const other of sessions.current.values()) {
          if (other.id === id || other.disk?.path !== session.disk.path || !other.state?.doc.eq(update.startState.doc)) continue;
          if (other.view) other.view.dispatch({changes:update.changes,userEvent:"input.shared-document"});
          else {const transaction=other.state.update({changes:update.changes});other.state=transaction.state;other.contentVersion=(other.contentVersion||0)+1;other.dirty=!documentMatchesText(other.state.doc,other.disk.text);mapStoredSessionContext(other.context,transaction);handleStoredChange(other.id,transaction,activeSession.current!==id);}
        }
      } finally { syncingSessions.current = false; }
    }
    if (activeSession.current !== id && update.docChanged && session.context) {
      if (session.context.proposal) session.context.proposal=mapAnchor(session.context.proposal,update.changes);
      session.context.undo=session.context.undo.map(value=>mapAnchor(value,update.changes));
    }
    if (activeSession.current === id) onUpdate(update);
    else if (update.docChanged || update.selectionSet) redraw();
  };
  function activateEditor(id: string) {
    if (id === activeSession.current) return;
    const previous = sessions.current.get(activeSession.current)!;
    previous.disk = disk.current;
    previous.state = view.current?.state || previous.state;
    previous.context = {proposal:proposal.current,undo:undo.current,writingNodeId};
    if (requestAnchor.current && running.current) stop();
    const next = sessions.current.get(id)!;
    activeSession.current=id;
    view.current=next.view; editorState.current=next.state; disk.current=next.disk;
    proposal.current=next.context?.proposal||null; undo.current=next.context?.undo||[];
    setActiveEditorId(id); setFile(next.imagePath||next.disk?.path||""); setDirty(next.dirty);
    setWritingNodeId(next.context?.writingNodeId||null);
    setOutline(next.state?headings(next.state):[]);
    const range=next.state?.selection.main;
    setSelection(range&&next.state?{from:range.from,to:range.to,text:next.state.sliceDoc(range.from,range.to)}:{from:0,to:0,text:""});
    setInlineRequest(null);setScratchReady(value=>value+1);setError("");
  }
  function closeEditor(id: string) {
    if(!desktopPanels.attach(id))return false;
    const session=sessions.current.get(id);if(session){captureEditorView(session);session.contentVersion=(session.contentVersion||0)+1;}
    if(workspace.close(id)!=='succeeded')return false;
    if(activeSession.current===id)workspace.open(editorIds.find(value=>value!==id&&workspace.isOpen(value))||'editor');
    return true;
  }
  function minimizeEditor(id:string) {
    if(!desktopPanels.attach(id))return;
    const session=sessions.current.get(id);if(session){captureEditorView(session);session.contentVersion=(session.contentVersion||0)+1;}
    workspace.minimize(id);
    if(activeSession.current===id){const next=editorIds.find(value=>value!==id&&workspace.isOpen(value));if(next)workspace.open(next);}
  }

  function finalizeTrashedSessions(affected:EditorSession[], safe:(session:EditorSession)=>boolean) {
    const disposable=affected.filter(session=>safe(session)&&!session.view?.composing&&!desktopPanels.isComposing()), kept=affected.filter(session=>!disposable.includes(session));
    const closing=new Set(disposable.map(session=>session.id));
    if(closing.has(activeSession.current)){
      const next=[...sessions.current.keys()].find(id=>!closing.has(id)&&workspace.isOpen(id)) || 'editor';
      if(next!==activeSession.current&&sessions.current.has(next)){workspace.open(next);activateEditor(next);}
    }
    let retained=0;
    const retireImage=(session:EditorSession)=>{if(!retireDeletedImage(session))return false;if(activeSession.current===session.id){disk.current=null;view.current=null;editorState.current=null;setFile('');setDirty(false);}return true;};
    for(const session of kept){
      if(retireImage(session))continue;
      retained++;
      session.disk=null;session.dirty=true;
      if(activeSession.current===session.id){disk.current=null;setFile('');setDirty(true);}
    }
    for(const session of disposable){
      // A native host can refuse to return its editor (for example during IME
      // composition). Keep that live editor rather than discarding its state.
      if(session.id!=='editor'&&!closeEditor(session.id)){
        if(retireImage(session))continue;
        session.disk=null;session.dirty=true;retained++;
        if(activeSession.current===session.id){disk.current=null;setFile('');setDirty(true);}
        continue;
      }
      session.contentVersion=(session.contentVersion||0)+1;
      session.imagePath=undefined;session.disk=null;session.state=null;session.view=null;session.dirty=false;session.landing=true;
      session.context=undefined;session.restoreScroll=undefined;session.restoreScrollLeft=undefined;
      if(activeSession.current===session.id){
        disk.current=null;view.current=null;editorState.current=null;proposal.current=null;undo.current=[];
        setFile('');setDirty(false);setWritingNodeId(null);
        setOutline([]);setSelection({from:0,to:0,text:''});setInlineRequest(null);
      }
    }
    redraw();
    return retained;
  }

  const { refresh, openFile, safeSwitch, openSaveAs, save, openBlankTab, createQuickNote, openExplorerFile, manageFile, preflightFileActions, reloadFromDisk, switchWorkspace, submitDialog, importFile } = useFileActions({
    api,appAlive,promptRef,dialogRef, uid, workspace, sessions, activeSession, activeTextSource, editorState, view, disk, proposal, undo, prompt, dialog, file, dirty, running, requestAnchor, structuring, switching, viewApplying, creatingNote, savingPaths, fileWorkspace, saveSession, finalizeTrashedSessions, applyDiskFile, annotations, references, bindings, stop, redraw, inform, setFile, setDirty, setError, setFileBusy, setNewNoteBusy, setEntries, setRoot, setConfirm, setDialog, setFilter, setRenameRequest, setCollapsed, setTrashRevision, setInlineRequest, setOutline, setSelection, setWritingNodeId,
  });
  function openDocumentList() {
    workspace.open('files');
    setFocusFileSearch(true);
  }
  function exportMarkdown() {
    const session=sessions.current.get(activeSession.current),state=session?.view?.state||session?.state;
    if(!state||proposal.current||fileBusy)return;
    if(desktopPanels.isComposing()) {setError('请先完成当前输入法组词，再导出文档。');return;}
    const format=session?.disk;
    const text=state.doc.toString();
    const contents=(format?.bom?'\uFEFF':'')+(format?.eol==='CRLF'?text.replace(/\r?\n/g,'\r\n'):text);
    const url=URL.createObjectURL(new Blob([contents],{type:'text/markdown;charset=utf-8'}));
    const link=document.createElement('a');
    link.href=url;
    link.download=((format?.path.split('/').at(-1)||'未命名').replace(/\.md$/i,''))+'-副本.md';
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const recentEntries=useMemo(()=>{
    if(!recentOpen)return [];
    const files=new Map(flattenEntries(entries).filter(entry=>entry.type==='file').map(entry=>[entry.path,entry]));
    return readRecentDocuments(fileWorkspace.info.id).flatMap(path=>{
      const entry=files.get(path);
      return entry?[entry]:[];
    });
  },[entries,fileWorkspace.info.id,recentOpen]);
  async function openRecentDocument(path:string) {
    const existing=[...sessions.current.values()].find(session=>(session.imagePath||session.disk?.path)===path&&workspace.isOpen(session.id));
    if(existing)workspace.open(existing.id);
    else await openExplorerFile(path,!sessions.current.get(activeSession.current)?.landing);
    const id=activeSession.current;
    requestAnimationFrame(()=>{if(activeSession.current===id)sessions.current.get(id)?.view?.focus();});
  }
  async function addReferenceBatch(sources:ReferenceSource[]){
    const owner=activeSession.current,session=sessions.current.get(owner),ownerPath=session?.disk?.path;
    const original={doc:(session?.view?.state||session?.state)?.doc,version:session?.contentVersion||0,proposal:proposal.current,prompt:promptRef.current?.value??prompt};
    const requireTarget=()=>{
      if(appAlive.current===false||activeSession.current!==owner||sessions.current.get(owner)!==session||session?.disk?.path!==ownerPath||
        (session?.view?.state||session?.state)?.doc!==original.doc||(session?.contentVersion||0)!==original.version||proposal.current!==original.proposal||(promptRef.current?.value??prompt)!==original.prompt)
        throw new Error('依据目标正文或会话已变化，请在当前正文中重新添加。');
      if(running.current||structuring.current||switching.current||viewApplying.current||savingPaths.current.size)
        throw new Error('AI 或文件操作正在进行，请结束后再添加依据。');
    };
    const actions=sources.map(source=>({action:'basis',path:source.path,type:source.type}));
    await preflightFileActions(actions);
    requireTarget();
    const tree=await api<{entries:Entry[]}>('/tree');
    requireTarget();
    await preflightFileActions(actions);
    requireTarget();
    const present=new Map(tree.entries.flatMap(function walk(entry):Entry[]{return [entry,...(entry.children||[]).flatMap(walk)];}).map(entry=>[entry.path,entry.type]));
    const accepted=sources.filter(source=>present.get(source.path)===source.type);
    const added=references.addSources(accepted);
    let index=0;
    const results=sources.map(source=>present.get(source.path)===source.type?added[index++]:{path:source.path,ok:false,error:'文件已移走、删除或类型已变化，请刷新列表。'});
    if(results.some(result=>result.ok))workspace.open('basis');
    return results;
  }
  const closingDocumentTab=useRef(false),closeTabFileBusy=useRef(fileBusy);
  closeTabFileBusy.current=fileBusy;
  async function closeDocumentTab(id:string) {
    const session=sessions.current.get(id);
    if(!session||closingDocumentTab.current)return;
    const originalPath=session.disk?.path,originalVersion=session.contentVersion||0,originalProposal=proposalFor(id);
    const valid=()=>sessions.current.get(id)===session&&session.disk?.path===originalPath&&(session.contentVersion||0)===originalVersion&&proposalFor(id)===originalProposal;
    const composing=()=>desktopPanels.isComposing()||!!session.view?.composing;
    const blocked=()=>!!requestAnchor.current&&running.current||structuring.current||switching.current||viewApplying.current||creatingNote.current||closeTabFileBusy.current||!!dialogRef.current;
    const retainedProposal=()=>!!originalProposal&&!!session.disk&&!!(session.view?.state||session.state);
    const pending=()=>!!proposalFor(id)&&!retainedProposal();
    const dirty=()=>session.dirty&&!retainedProposal();
    closingDocumentTab.current=true;
    try {
      const result=await prepareDocumentTabClose({blocked,composing,pending,dirty,save:()=>saveSession(id,true),valid});
      if(result!=='ready'){
        setError(result==='composing'?'请先完成当前输入法组词，再关闭标签页。':result==='blocked'?'请先停止正文生成或等待当前操作完成，再关闭标签页。':result==='pending'?'这条待审建议暂时无法保留，请先在正文中处理。':result==='unsaved'?'文档未能保存或保存期间有新修改，请先处理保存冲突或另存，再关闭标签页。':'标签页状态已变化，请处理当前操作后重试。');return;
      }
      if(composing()){setError('请先完成当前输入法组词，再关闭标签页。');return;}
      if(!valid()||blocked()||pending()||dirty()){setError('标签页状态已变化，请处理当前操作后重试。');return;}
      if(id!=='editor'&&!closeEditor(id))return;
      setError('');
      if(originalProposal&&retainedProposal()){
        if(id!=='editor'){
          redraw();
          return;
        }
        // The primary slot must remain in the layout. Move the intact draft and
        // its undo history to a closed document session before showing the landing page.
        captureEditorView(session);
        const reviewId='editor:'+uid();
        const context=activeSession.current===id?{proposal:originalProposal,undo:undo.current,writingNodeId}:session.context!;
        const state=rebindDocumentUpdates(session.state!,bindings(reviewId).onUpdate);
        sessions.current.set(reviewId,{...session,id:reviewId,state,view:null,context});
      }
      session.contentVersion=(session.contentVersion||0)+1;
      session.imagePath=undefined;session.disk=null;session.state=null;session.view=null;session.dirty=false;session.landing=true;
      session.context=undefined;session.restoreScroll=undefined;session.restoreScrollLeft=undefined;
      if(activeSession.current===id){
        disk.current=null;view.current=null;editorState.current=null;proposal.current=null;undo.current=[];
        setFile('');setDirty(false);setWritingNodeId(null);
        setOutline([]);setSelection({from:0,to:0,text:''});setInlineRequest(null);
      }
      redraw();
    } finally {closingDocumentTab.current=false;}
  }
  function stop() {
    stopWritingGeneration({generation,controller,requestAnchor,running,proposal},{setBusy,setStream});
  }
  useEffect(() => {
    let cancelled = false;
    const onError=(error:Error)=>{if(!cancelled)setError(error.message);};
    void refresh().catch(onError);
    void api<Config>('/config').then(next=>{if(!cancelled)setConfig(current=>next.revision>=current.revision?next:current);}).catch(onError);
    return () => {
      cancelled = true;
      generation.current++;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4200);
    return () => clearTimeout(timer);
  }, [notice]);
  function chooseSidebar(next: "files" | "outline" | "scratch") {
    workspace.open(next);
  }
  useEffect(() => {
    if (chatOpen && chatTab === "conversation")
      messagesEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy, chatOpen, chatTab]);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (prompt.trim()||[...sessions.current.values()].some(session => session.dirty||proposalFor(session.id))) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty,prompt,proposalFor]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const document=(event.target as HTMLElement|null)?.ownerDocument||window.document;
      const fileKey=event.key.toLowerCase();
      if((event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey&&(fileKey==='n'||fileKey==='o')&&!event.defaultPrevented&&!event.isComposing&&!dialog&&!confirm&&!help&&!recentOpen&&!document.querySelector('[role="dialog"],dialog[open]')){
        event.preventDefault();
        if(event.repeat)return;
        if(fileKey==='o')openDocumentList();
        else if(!fileBusy&&!newNoteBusy&&!busy&&!desktopPanels.isComposing())void createQuickNote();
        return;
      }
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'&&!document.querySelector('[role="dialog"],dialog[open]')&&!(event.target as HTMLElement).closest('input,textarea')){event.preventDefault();ribbonCommand('find');return;}
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if(activeTextSource.current==='scratch')void sessionCallbacks.current.prepareScratch?.();else void save();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        openChat("conversation");
        if (selection.text) setMode("edit");
        setTimeout(() => promptRef.current?.focus(), 0);
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.altKey &&
        event.key.toLowerCase() === "m"
      ) {
        event.preventDefault();
        markText();
      }
      if (event.key === "Escape" && running.current) {
        stop();
        inform("已停止。正文没有改变。");
      }
    };
    const windows=[window,...desktopPanels.windows.values()];
    windows.forEach(win=>win.addEventListener("keydown",key));
    return () => windows.forEach(win=>win.removeEventListener("keydown",key));
  });

  useEffect(()=>window.hiveDesktop?.onServiceError(()=>setError('本地服务已停止。未保存内容仍保留在窗口中，请导出或复制备份后重新启动。')),[]);
  useEffect(()=>fileWorkspace.register(async()=>desktopPanels.isComposing()?'请先完成当前输入法组词，再切换文件夹或退出。':undefined));
  useEffect(()=>window.hiveDesktop?.onCloseRequested(()=>{
    if(closing.current)return;
    closing.current=true;setClosingWindow(true);
    const documents=[document,...[...desktopPanels.windows.values()].map(popup=>popup.document)];
    const previousInert=documents.map(doc=>doc.body.inert);
    documents.forEach(doc=>{doc.body.inert=true;});
    void (async()=>{
      let timeout:ReturnType<typeof setTimeout>|undefined;
      try{
        if(running.current||switching.current||structuring.current||viewApplying.current||fileBusy)throw new Error('请先停止 AI 生成或等待当前文件操作完成，再退出。');
        if(prompt.trim()||[...sessions.current.values()].some(session=>proposalFor(session.id)))throw new Error('请先发送或清空未发送的消息，并处理待审建议，再退出。');
        if(desktopPanels.isComposing()||[...sessions.current.values()].some(session=>session.view?.composing)||scratchView.current?.composing)throw new Error('请先完成当前输入法组词，再退出。');
        if(savingPaths.current.size)throw new Error('文件正在保存，请稍后重试退出。');
        const prepare=async()=>{
          await fileWorkspace.flush();
          for(const session of sessions.current.values())if(session.dirty&&!await saveSession(session.id,true))throw new Error('有正文未能保存，请先处理冲突或另存副本，再退出。');
          await fileWorkspace.flush();
        };
        await Promise.race([prepare(),new Promise<never>((_resolve,reject)=>{timeout=setTimeout(()=>reject(new Error('保存等待超时，内容仍保留在窗口中。请检查服务和保存状态后重试退出。')),20000);})]);
        if([...sessions.current.values()].some(session=>session.dirty)||savingPaths.current.size)throw new Error('还有内容正在保存，请稍后重试退出。');
        flushThemePreferences();
        await flushThemeFiles();
        window.hiveDesktop?.finishClose(true);
      }catch(error){setError((error as Error).message);window.focus();window.hiveDesktop?.finishClose(false);}
      finally{clearTimeout(timeout);documents.forEach((doc,index)=>{doc.body.inert=previousInert[index];});closing.current=false;setClosingWindow(false);}
    })();
  }));
  useEffect(()=>{
    if(!closingWindow)return;
    const block=(event:Event)=>{event.preventDefault();event.stopImmediatePropagation();};
    const documents=[document,...[...desktopPanels.windows.values()].map(popup=>popup.document)];
    for(const doc of documents)for(const type of ['beforeinput','keydown','paste','drop'])doc.addEventListener(type,block,true);
    return()=>{for(const doc of documents)for(const type of ['beforeinput','keydown','paste','drop'])doc.removeEventListener(type,block,true);};
  },[closingWindow,desktopPanels.windows]);
  useEffect(()=>{if(help||confirm||recentOpen||dialog&&!dialog.target)window.focus();},[settings,help,confirm,recentOpen,dialog]);

  function openSettings(section:SettingsSection='models') {setSettingsSection(section);setSettingsRestoreKey(value=>value+1);setSettings(true);if(settings)desktopPanels.focus('settings');}
  async function updateSettings(route:string,body:unknown) {
    setConfigBusy(true);
    try {const next=await api<Config>(route,body);setConfig(current=>next.revision>=current.revision?next:current);}
    finally {setConfigBusy(false);}
  }
  async function selectChatModel(choice: string) {
    if(choice==='settings'){openSettings('models');return;}
    setError('');
    try {await updateSettings('/config',{revision:config.revision,demo:choice==='demo',...(choice==='demo'?{}:{selection:parseModelChoice(choice)})});}
    catch(error){setError((error as Error).message);}
  }
  // 快捷栏的按钮＝一步执行：切到该模式，并立刻对当前文档/选区跑一轮。
  function runFromDock(next: Mode) {
    setMode(next);
    if(next!=="discuss")workspace.open(activeSession.current);
    void generate({ mode: next, allowEmptyPrompt: true });
  }
  function chooseMode(next: Mode) {
    if(next!=="discuss")workspace.open(activeSession.current);
    setMode(next);
    openChat("conversation");
    setTimeout(() => promptRef.current?.focus(), 0);
  }
  function openChat(
    tab: "conversation" | "annotations" = "conversation",
    position?: { x: number; y: number },
  ) {
    if (tab === "annotations") { workspace.open("annotations"); return; }
    setChatTab("conversation");
    rightPanel.raise();
    if (chatOrb || position) {
      const width = Math.min(orbBounds.current.width, window.innerWidth - 16),
        height = Math.min(orbBounds.current.height, window.innerHeight - 16);
      const point = position ||
        orbPosition.current || {
          x: window.innerWidth - 72,
          y: window.innerHeight - 170,
        };
      rightPanel.floatAt({
        x: Math.max(
          8,
          Math.min(window.innerWidth - width - 8, point.x - width + 46),
        ),
        y: Math.max(
          8,
          Math.min(window.innerHeight - height - 8, point.y - height + 46),
        ),
        width,
        height,
      });
    }
    setChatOrb(false);
    setChatOpen(true);
  }
  function locate(pos: number) {
    workspace.open(activeSession.current);
    const v = view.current;
    if (!v) return;
    v.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: "center" }),
    });
    v.focus();
  }
  const currentHeading = outline.filter((h) => h.from <= selection.from).at(-1);
  const currentWritingNode =
    writingOutline.nodes.find((node) => node.id === writingNodeId) ||
    writingOutline.nodes.find(
      (node) =>
        currentHeading &&
        targetForNode(node, outline)?.from === currentHeading.from,
    );
  const p = proposal.current;
  const reviewSessions=editorIds.filter(id=>id!==activeEditorId&&proposalFor(id));
  const writingBusy=busy&&!!requestAnchor.current;
  function reviewProposal(id:string){
    const session=sessions.current.get(id);
    if(!session||!proposalFor(id))return;
    reviewTarget.current=id;
    if(workspace.isOpen(id))workspace.open(id);
    else if(workspace.openDocumentTab(id)!=='succeeded'){
      reviewTarget.current=null;
      setError('无法打开待审建议，请完成输入法组词或当前窗口操作后重试。');
      return;
    }
    if(session.view){reviewTarget.current=null;revealProposal(id,session.view);}
  }

  function generate(options?:GenerationOptions) {
    const nextMode=options?.annotations?'discuss':options?.mode??mode;
    if(nextMode!=='discuss'&&pendingProposal(activeSession.current)&&!p){
      setError('这个文件还有待审建议，请在对话中打开原标签页审阅。');
      return;
    }
    return generateWriting({
      document:{view,disk,sessions,activeSession,file,outline,currentHeading,currentWritingNode},
      model:{config,reasoningEffort:reasoning.effort},
      conversation:{mode,prompt,messages,setPrompt,setLastRequest,add},
      lifecycle:{running,generation,controller,requestAnchor,proposal},
      references,writingOutline,request,annotationResponded:annotations.responded,
      ui:{setError,setBusy,setStream,openPanel:workspace.open,inform,redraw},
    },options);
  }
  const {accept,reject,undoAI}=createProposalActions({view,disk,proposal,undo,writingOutline,add,setError,inform,redraw,setMode,openChat:()=>openChat('conversation'),promptRef});

  
  function iconRail(edge:DockEdge){
    const icons:Record<string,typeof FileText>={files:FolderOpen,repositories:FolderOpen,conversation:MessageSquare,outline:ListTree,toc:ListTree,scratch:PencilLine,annotations:Highlighter,basis:FileText,search:Search,trash:Trash2};
    const items=workspace.autoHideItems.filter(item=>item.edge===edge).map(item=>({...item,label:panelLabel(item.id),Icon:sessions.current.has(item.id)?FileText:icons[item.id]||FileText,number:sessions.current.has(item.id)?editorIds.indexOf(item.id)+1:undefined}));
    if(!items.length)return null;
    const scale=appearanceSettings.appearance.uiScale/100;
    return <div className="rail-edge-wrap"><PanelIconRail minimumTriggerMs={panelIconDragPreferences.preferences.minimumTriggerMs} holdDelayMs={panelIconDragPreferences.preferences.holdDelayMs} holdStyle={panelIconDragPreferences.preferences.holdStyle} edge={edge} items={items} scale={scale} onToggle={workspace.toggleAutoHide} onMove={workspace.repositionAutoHide} onDock={workspace.openDocked}/>{(edge==='left'||edge==='right')&&<RailEdgeHandle edge={edge} scale={scale} disabled={!workspace.canPullRail(edge)} onCommit={width=>workspace.dockAutoHideRail(edge,width)}/>}</div>;
  }
  const stale = p
    ? !previewIntact(p, view.current?.state.doc, file)
    : false;
  // 建议就地显示在正文锚点后面，不再用底部浮层压住文字。
  const inlineProposal=useMemo<InlineProposal|null>(()=>p?{from:p.from,to:p.to,mode:modeLabels[p.mode],count:p.count,text:p.text,original:p.original,reason:p.reason,stale,node:p.node}:null,[p,stale]);
  return (
    <div className="app-shell" data-revision={tick}>
      <AppHeader
        workspace={workspace} sessions={sessions} editorState={editorState} editorIds={editorIds} panelLabel={panelLabel}
        activateEditor={activateEditor} closeEditor={closeEditor} openChat={openChat} openSettings={openSettings}
        save={save} openSaveAs={openSaveAs} fileWorkspace={fileWorkspace} config={config}
        file={file} fileBusy={fileBusy} chatOpen={chatOpen} leftOpen={leftOpen} setError={setError} setHelp={setHelp}/>
      <Ribbon visible={appearanceSettings.appearance.ribbonVisible} collapsed={appearanceSettings.appearance.ribbonCollapsed}
        onCommand={ribbonCommand} editorReady={activeTextSource.current==='scratch'?workspace.isOpen('scratch')&&!!scratchView.current:!!view.current}
        fileActions={{new:{run:()=>void createQuickNote(),disabled:fileBusy||newNoteBusy||busy},open:{run:openDocumentList},
          export:{run:exportMarkdown,disabled:!editorState.current||!!proposal.current||fileBusy},recent:{run:()=>setRecentOpen(true)}}}
        onCollapsedChange={value=>appearanceSettings.setAppearance(old=>({...old,ribbonCollapsed:value}))}
        onVisibilityChange={value=>{appearanceSettings.setAppearance(old=>({...old,ribbonVisible:value}));if(!value){inform('已隐藏顶部编辑栏，可在设置 → 界面中重新显示。');document.querySelector<HTMLButtonElement>('button[aria-label="设置"]')?.focus();}}}
        onSettings={()=>openSettings('appearance')} viewControls={<ViewControls mode={mode} workspaceId={fileWorkspace.info.id} onCapture={captureView} onApply={applyView}/>}/>
      <div className="workbench-host nearby-workbench-host">
        <div className="nearby-workbench-middle">
        {iconRail('left')}
      <div className="workbench free-workbench" ref={workbenchRef}>
        <DesktopPanel id="files" title="文档" open={leftOpen}><aside
          data-panel-id="files" aria-label="文档面板"
          ref={leftPanel.ref}
          className={
            "sidebar workspace-panel " + (leftPanel.grouped?'panel-grouped ':'') +
            (leftPanel.floating ? "panel-floating" : "panel-docked")
          }
          style={leftPanel.style}
          onPointerDownCapture={leftPanel.raise}
        >
          <div
            className="sidebar-title panel-drag-header" data-lock-panel="files" data-position-locked={leftPanel.positionLocked||undefined}
            onPointerDown={leftPanel.beginDrag}
            title={leftPanel.lockHint}
          >
            <b>文档</b>
            <PanelControls chrome={chrome} id="files" />
          </div>
          <div
            className="sidebar-content"
            id="sidebar-panel-files"
            aria-label="文档列表"
          >
            <FileExplorer onRefresh={refresh} entries={entries} workspaceId={fileWorkspace.info.id} root={root} file={file} dirty={dirty} filter={filter} setFilter={setFilter} collapsed={collapsed} setCollapsed={setCollapsed} renameRequest={renameRequest}
              treeReady={!!root} onOpenRepositories={()=>workspace.open('repositories')}
              onOpen={openExplorerFile} onAction={manageFile} onPreflight={preflightFileActions} onReferenceBatch={addReferenceBatch}
              onReferenceDrop={addReference} onAI={path=>{const entry=entries.flatMap(function walk(value):Entry[]{return [value,...(value.children||[]).flatMap(walk)];}).find(entry=>entry.path===path);if(entry)addReference({path,type:entry.type});}}/>
          </div>
          <input
            ref={importRef}
            type="file"
            accept=".md,text/markdown"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importFile(f);
            }}
          />
          <div className="sidebar-trash-footer panel-status-footer" aria-label="文档底栏"><button type="button" aria-label="回收站" title="打开回收站" aria-pressed={workspace.isOpen('trash')} onClick={()=>workspace.open('trash')}><Trash2 size={14}/>回收站</button></div>
          {leftPanel.handles}
        </aside></DesktopPanel>
        {editorIds.map((id,index)=>{
          const session=sessions.current.get(id)!,documentPanel=workspace.panel(id);
          return (<DesktopPanel key={id} id={id} title={`${panelLabel(id)} · 正文 ${index+1}`} open={workspace.isOpen(id)} visible={documentPanel.visible}><main data-panel-id={id} aria-label={`正文编辑区 ${index+1}`}
          className={
            "document-pane workspace-panel " + (documentPanel.grouped?'panel-grouped ':'') + (activeEditorId === id ? "active-editor " : "") +
            (documentPanel.floating ? "panel-floating" : "panel-docked")
          }
          ref={documentPanel.ref}
          style={documentPanel.style}
          onPointerDownCapture={()=>{activateEditor(id);documentPanel.raise();}} onFocusCapture={()=>activateEditor(id)}
        >
          <div
            className="document-tabs panel-drag-header" data-lock-panel={id} data-position-locked={documentPanel.positionLocked||undefined}
            onPointerDown={documentPanel.beginDrag}
            title={documentPanel.primary?'正文主版面 · 位置固定':documentPanel.lockHint}
            data-position-fixed={!documentPanel.movable||undefined}
          >
            <div className="document-tab" data-tab-detachable={canDetachDocumentTab||undefined} title={`${session.landing?'新标签页':session.imagePath||session.disk?.path||'未命名稿'}${canDetachDocumentTab?' · 拖动移出此标签':''}`} onPointerDown={event=>{
              if(!canDetachDocumentTab)return;event.stopPropagation();workspace.beginTabDrag(id,event,{fromTab:true,onFinish:()=>{}});
            }}>
              <span>{session.landing?'新标签页':(session.imagePath||session.disk?.path)?.split("/").at(-1) || "未命名稿"}</span>
              {session.dirty && <i className="dirty-dot" />}
              <button type="button" className="document-tab-close" data-no-drag aria-label={`关闭${panelLabel(id)}标签页`} title="关闭标签页" onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();void closeDocumentTab(id);}}><X size={13}/></button>
            </div>
            <NewTabButton onClick={()=>openBlankTab(id)} disabled={writingBusy||newNoteBusy||fileBusy}/>
            <div className="tab-spacer" />
            <button
              className="icon-button"
              aria-label="撤回 AI 修改"
              title="撤回最近一次 AI 修改"
              onClick={undoAI}
              disabled={activeEditorId===id?!undo.current.length:!session.context?.undo.length}
            >
              <RotateCcw size={15} />
            </button>
            <PanelControls chrome={chrome} id={id} />
          </div>
          {session.disk&&fileConflicts[session.disk.path]&&<div className="file-conflict" role="alert"><span>{fileConflicts[session.disk.path]}</span><button type="button" onClick={()=>reloadFromDisk(id)}>重新读取磁盘</button><button type="button" onClick={()=>{activateEditor(id);openSaveAs(session.disk!.path);}}>另存本地副本</button></div>}
          {session.imagePath?<><ImageFileView key={fileWorkspace.info.id+session.imagePath} path={session.imagePath} workspaceId={fileWorkspace.info.id}/>{emptyPanelFooter("图片")}</>:session.landing?<><NewTabPage active={activeEditorId===id} busy={newNoteBusy||fileBusy||busy} onCreate={()=>void createQuickNote(id)} onOpen={openDocumentList}/>{emptyPanelFooter("新标签页")}</>:<>
                {<Editor initialState={session.state} keepAlive={busy&&activeEditorId===id||!!dialog?.target&&dialog.target.editor===session.view} documentFile={session.disk?.path||''} onOpenLink={target=>{try{const path=resolveLinkTarget(session.disk?.path||'',target);activateEditor(id);void openExplorerFile(path).catch(error=>setError(error.message));}catch(error){setError((error as Error).message);}}} annotationTool={annotationTool} searchActive={workspace.isOpen('search')&&activeEditorId===id&&activeTextSource.current==='document'} onFind={()=>{activateEditor(id);activeTextSource.current='document';ribbonCommand('find');}} displayMode={session.displayMode||'live'} typewriter={!!session.typewriter} onReady={bindings(id).onReady} onUpdate={bindings(id).onUpdate} onFocus={()=>{if(activeTextSource.current!=='document'){activeTextSource.current='document';redraw();}}} onMarkSelection={()=>{activateEditor(id);markText('document',sessions.current.get(id)?.disk?.path||'');}} onUnmarkSelection={annotationId=>{activateEditor(id);unmarkText('document',annotationId,sessions.current.get(id)?.disk?.path||'');}} onShowAnnotations={context=>{activateEditor(id);showLocalAnnotation('document',context,sessions.current.get(id)?.disk?.path||'');}} onError={setError} inlineProposal={activeEditorId===id?inlineProposal:null}/>}
              {activeEditorId===id&&<ProposalOverlay view={view.current} proposal={inlineProposal} accept={accept} reject={reject}/>
              }
          <EditorStatusBar status={session.disk?`自由写作 · ${session.dirty?'有未保存的修改':'已保存'}`:'未打开文档'} aiStatus={activeEditorId===id?(writingBusy?'AI 正在生成':p?stale?'建议已被改动，请核对':'预览中：✓ 保留 / ✗ 撤掉，未保存':undefined):session.context?.proposal?'1 条建议等待审阅':undefined} state={session.view?.state||session.state} eol={session.disk?.eol} bom={session.disk?.bom} preferences={statusPreferences} onSettings={()=>openSettings('appearance')}/>
          </>}
          {documentPanel.handles}
        </main></DesktopPanel>
);
        })}
          <DesktopPanel id="conversation" title="对话" open={chatOpen}><aside data-panel-id="conversation" aria-label="对话面板"
            ref={rightPanel.ref}
            className={
              "chat-panel compact-chat workspace-panel " + (rightPanel.grouped?'panel-grouped ':'') +
              (rightPanel.floating
                ? "panel-floating floating"
                : "panel-docked docked")
            }
            style={rightPanel.style}
            onPointerDownCapture={rightPanel.raise}
          >
            <div
              className="chat-header panel-drag-header" data-lock-panel="conversation" data-position-locked={rightPanel.positionLocked||undefined}
              onPointerDown={rightPanel.beginDrag}
              title={rightPanel.lockHint}
            >
              <WritingModeControl mode={mode} onMode={chooseMode}/>
              <PanelControls chrome={chrome} id="conversation" />
            </div>
            <div className="chat-context">
              <FileText size={13} />
              <span>{`正文 ${editorIds.indexOf(activeEditorId)+1}`} · {file.split("/").at(-1) || "未打开文档"}</span>
              <button
                className="chat-basis-button"
                title="查看 AI 实际输入"
                onClick={() => workspace.open('basis')}
              >
                <BookOpen size={12} aria-hidden="true" />
                依据
                <ChevronRight size={12} aria-hidden="true" />
              </button>
            </div>
            <div className="conversation-view">
              <div className="messages">
                {messages.filter(message=>message.id!=="welcome"&&message.role!=="system").map((message) => (
                  <div key={message.id} className={"message " + message.role}>
                    <p>{message.content}</p>
                  </div>
                ))}
                {busy && (
                  <div className="message assistant thinking">
                    <span className="chat-reply-status">正在回复…</span>
                    {stream ? (
                      <pre>{stream}</pre>
                    ) : (
                      null
                    )}
                  </div>
                )}
                {reviewSessions.map(id=>(
                  <div className="chat-context" key={id}>
                    <FileText size={13}/>
                    <span title={sessions.current.get(id)?.disk?.path}>{sessions.current.get(id)?.disk?.path}</span>
                    <button type="button" onClick={()=>reviewProposal(id)}>审阅建议<ChevronRight size={12}/></button>
                  </div>
                ))}
                <div ref={messagesEnd} />
              </div>
              <div className="chat-bottom">
                <ChatComposer inputRef={promptRef} value={prompt} onChange={setPrompt} onSend={()=>void generate()} onStop={()=>{stop();inform("已停止，正文没有改变。");}}
                  busy={busy} disabled={mode!=='discuss'&&(!disk.current||pendingProposal(activeEditorId))} placeholder={mode==="edit"?"输入修改要求…":mode==="outline"?"这一节想怎么写…":mode==="continue"?"接下来想写什么…":"输入消息…"}
                  config={config} modelBusy={configBusy} reasoningEffort={reasoning.effort} onReasoningChange={reasoning.setEffort} onModelChange={choice=>void selectChatModel(choice)}/>{reasoning.saveError&&<p role="status">{reasoning.saveError}</p>}
              </div>
            </div>
            {emptyPanelFooter("对话")}
            {rightPanel.handles}
          </aside></DesktopPanel>
        <PanelFrame chrome={chrome} id="repositories" title="仓库管理" className="repositories-workspace">{workspace.isOpen('repositories')&&<RepositoryPanel onSwitch={switchWorkspace} onReturn={()=>workspace.close('repositories')}/>}</PanelFrame>
        <PanelFrame chrome={chrome} id="toc" title="标题目录" className="toc-workspace"><TableOfContents key={activeEditorId+':'+file} file={file} items={outline} current={currentHeading?.from} onLocate={locate}/></PanelFrame>
        <PanelFrame chrome={chrome} id="outline" title="大纲" className="outline-workspace"><div className="sidebar-content">            <WritingOutline
              key={file}
              items={outline}
              nodes={/\.md$/i.test(file)?writingOutline.nodes:[]}
              selectedId={currentWritingNode?.id || null}
              onSelect={setWritingNodeId}
              onSave={writingOutline.save}
              busy={writingOutline.busy}
              ready={/\.md$/i.test(file)&&writingOutline.ready}
              onRetry={writingOutline.retry}
              onLocate={locate}
              onWrite={(id) => {
                setWritingNodeId(id);
                const target = writingOutline.nodes.find(
                  (node) => node.id === id,
                );
                const heading = target
                  ? targetForNode(target, outline)
                  : undefined;
                if (heading) locate(heading.from);
                chooseMode("outline");
              }}
            />
</div></PanelFrame>
        <PanelFrame chrome={chrome} id="scratch" title="草稿" className="scratch-workspace"><ScratchPad keepAlive={!!dialog?.target&&dialog.target.editor===scratchView.current}
              active={workspace.isOpen("scratch")}
              onError={setError}
              onEditor={onScratchEditor}
              onEditorUpdate={onScratchUpdate}
              onMarkSelection={()=>markText('scratch')}
              onUnmarkSelection={annotationId=>unmarkText('scratch',annotationId)}
              onShowAnnotations={context=>showLocalAnnotation('scratch',context)}
              onEditorFocus={()=>{if(activeTextSource.current!=='scratch'){activeTextSource.current='scratch';redraw();}}}
              searchActive={workspace.isOpen('search')&&activeTextSource.current==='scratch'}
              annotationTool={annotationTool}
              onFind={()=>{activeTextSource.current='scratch';ribbonCommand('find');}}
              onSaved={() =>
                void refresh().catch((error) => setError(error.message))
              }
              onOpenFile={() => safeSwitch(() => void openFile("自由草稿.md"))}
            />
</PanelFrame>
        <PanelFrame chrome={chrome} id="annotations" title="标注" className="annotations-workspace"><AnnotationPanel focusRequest={annotationFocus}
                items={annotations.items}
                selected={annotations.selected}
                toggle={annotations.toggle}
                selectAll={annotations.selectAll}
                remove={annotations.remove}
                locate={locateAnnotation}
                reanchor={reanchorAnnotation}
                onSend={sendAnnotations}
                busy={busy}
                saveError={annotations.saveError}
                retrySave={annotations.retrySave}
              />
</PanelFrame>
        <PanelFrame chrome={chrome} id="properties" title="笔记属性" className="properties-workspace"><NotePropertiesPanel target={(()=>{if(activeTextSource.current==='scratch'){const editor=scratchView.current;if(!editor)return null;return {editor,file:'自由草稿.md',valid:()=>activeTextSource.current==='scratch'&&scratchView.current===editor};}const session=sessions.current.get(activeEditorId),editor=session?.view,path=session?.disk?.path;if(!editor||!path||session?.landing)return null;return {editor,file:path,valid:()=>activeTextSource.current==='document'&&activeSession.current===activeEditorId&&sessions.current.get(activeEditorId)?.view===editor&&sessions.current.get(activeEditorId)?.disk?.path===path};})()} targetKey={activeTextSource.current==='scratch'?'scratch:自由草稿.md':'document:'+activeEditorId+':'+file} onApplied={()=>inform('笔记属性已应用。')}/></PanelFrame>
        <PanelFrame chrome={chrome} id="basis" title="依据" className="basis-workspace"><InputBasisPanel request={lastRequest} file={file} mode={mode} sources={references.sources} entries={entries} workspaceId={fileWorkspace.info.id} onChange={references.setSources}/>{references.saveError&&<p role="status">{references.saveError}</p>}</PanelFrame>
        <PanelFrame chrome={chrome} id="trash" title="回收站" className="trash-workspace"><TrashPanel open={workspace.isOpen('trash')} refreshKey={trashRevision} onRestore={id=>manageFile({action:'restore',id})} onChanged={()=>setTrashRevision(value=>value+1)}/></PanelFrame>
        <PanelFrame chrome={chrome} id="search" title="查找替换" className="find-replace-workspace"><FindReplacePanel editor={activeTextSource.current==='scratch'?scratchView.current:view.current} open={workspace.isOpen('search')} onClose={()=>workspace.close('search')} label={activeTextSource.current==='scratch'?'自由草稿.md':file.split('/').at(-1)||'未命名稿'}/></PanelFrame>
        {workspace.tabGroups.map(group=><WorkspaceTabs key={group.id} group={group} style={group.style} label={panelLabel} onSelect={workspace.open}
          positionLocked={workspace.isPositionLocked(group.active)} lockHint={workspace.panel(group.active).lockHint} onNewTab={group.panels.every(id=>sessions.current.has(id))?()=>openBlankTab(group.active):undefined} newTabDisabled={writingBusy||newNoteBusy||fileBusy}
          onTabDrag={canDetachDocumentTab&&group.panels.every(id=>sessions.current.has(id))?workspace.beginTabDrag:undefined} isDirty={id=>!!sessions.current.get(id)?.dirty}
          onCloseTab={group.panels.every(id=>sessions.current.has(id))?id=>void closeDocumentTab(id):undefined}
          onRaise={workspace.panel(group.active).raise} onDrag={workspace.beginGroupDrag} handles={workspace.panel(group.active).groupHandles} controls={<PanelControls chrome={chrome} id={group.active} groupMembers={group.panels} />}/>)}
        {workspace.chrome}
        {!workspace.openIds.length && <div className="empty-workspace"><p>单击边缘图标，或从「视图 → 面板」打开需要的面板。</p><button onClick={()=>workspace.open("editor")}>打开正文编辑区</button></div>}
      </div>
        {iconRail('right')}
        </div>
      </div>
      {chatOrb && appearanceSettings.appearance.floatingToolbarVisible!==false && (
        <FloatingOrb
          busy={busy}
          initialPosition={orbPosition.current}
          onPosition={(position) => {
            orbPosition.current = position;
          }}
          onOpen={(position) => openChat(chatTab, position)}
        />
      )}
      {([['main',document],...[...desktopPanels.windows.entries()].map(([id,popup])=>[id,popup.document])] as [string,Document][]).map(([key,ownerDocument])=><InlineAnnotationEditor key={key} ownerDocument={ownerDocument}
        items={annotations.items.filter(item=>(item.source==='document'?view.current:scratchView.current)?.dom.ownerDocument===ownerDocument)}
        request={inlineRequest&&annotations.items.some(item=>item.id===inlineRequest.id&&(item.source==='document'?view.current:scratchView.current)?.dom.ownerDocument===ownerDocument)?inlineRequest:null}
        editorFor={(source) => {const editor=source==='document'?view.current:scratchView.current;return editor?.dom.ownerDocument===ownerDocument?editor:null;}}
        onEdit={annotations.edit}
        onSend={sendAnnotations}
        onRemove={annotations.remove} onFocusGlobal={id=>{setAnnotationFocus({id,nonce:Date.now()});workspace.open('annotations');}} onOpenGlobal={id=>{setAnnotationFocus({id,nonce:Date.now()});workspace.open('annotations');}}
        saving={annotations.saving}
        busy={busy}
        toolActive={annotationTool}
        bubblePlacement={annotationPreferences.preferences.bubblePlacement}
      />)}
      {closingWindow&&([document,...[...desktopPanels.windows.values()].map(popup=>popup.document)]).map((doc,index)=>createPortal(<div className="desktop-closing" role="status">正在保存并退出…</div>,doc.body,`closing-${index}`))}
      {appearanceSettings.appearance.floatingToolbarVisible!==false&&<GlobalToolbar mode={mode} continuationLimit={config.continuationLimit} aiOpen={chatOpen&&!desktopPanels.hiddenWindows.has('conversation')} annotationTool={annotationTool}
        onAnnotate={()=>setAnnotationTool(value=>!value)}
        onRun={runFromDock} busy={busy} onToggleAi={()=>{if(desktopPanels.windows.has('conversation')){desktopPanels.toggleVisibility('conversation');return;}if(chatOpen)workspace.minimize('conversation');else {if(workspace.autoHideItems.some(item=>item.id==='conversation')){setChatTab('conversation');setChatOrb(false);workspace.open('conversation');}else openChat('conversation');setTimeout(()=>promptRef.current?.focus(),0);}}}/>}
      {notice && (
        <div className="toast" role="status">
          <CheckCheck size={16} />
          {notice}
        </div>
      )}
      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button aria-label="关闭错误提示" onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {settings && <SettingsPage panelIconDragPreferences={panelIconDragPreferences} annotationPreferences={annotationPreferences} config={config} initialSection={settingsSection} restoreKey={settingsRestoreKey} appearance={appearanceSettings} statusPreferences={statusPreferences} busy={configBusy}
        onRequest={updateSettings} onProbe={(body:ModelProbeRequest,signal?:AbortSignal)=>requestApi<ModelProbeResult>(request,'/model-services/probe',body,signal)}
        onReload={async()=>{const next=await api<Config>('/config');setConfig(current=>next.revision>=current.revision?next:current);}} onClose={()=>setSettings(false)}/>}
      {recentOpen&&<FilePicker entries={recentEntries} onOpen={openRecentDocument} onClose={()=>setRecentOpen(false)}/>}
      {dialog&&(dialog.kind==='image'||dialog.kind==='table')&&dialog.target&&<EditorInsertDialog kind={dialog.kind} target={dialog.target} onClose={()=>setDialog(null)} onInserted={()=>{const target=dialog.target!;setDialog(null);if(dialog.kind==='image')void refresh().catch(error=>setError(error.message));requestAnimationFrame(()=>{if(target.valid())target.editor.focus();});inform(dialog.kind==='image'?'已插入图片。':'已插入表格。');}}/>}
      {dialog && dialog.kind!=='image'&&dialog.kind!=='table'&&dialog.kind!=='properties'&&(
        <div className="modal-backdrop">
          <form className="modal small-modal" onSubmit={submitDialog}>
            <div className="simple-modal-heading">
              <h2>{dialog.title}</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭文件操作"
                onClick={() => setDialog(null)}
              >
                <X size={18} />
              </button>
            </div>
            <label>
              {dialog.kind === "folder" ? "文件夹名称" : "工作空间内的相对路径"}
              <input
                aria-label="文件路径"
                autoFocus
                value={dialog.value}
                onChange={(e) =>
                  setDialog({ ...dialog, value: e.target.value })
                }
              />
            </label>
            <p className="settings-note">
              {dialog.kind === "rename"
                ? "可填写「文件夹/文档.md」整理位置。同名文件不会被覆盖。"
                : dialog.kind === "saveAs"
                  ? "保存当前正文为新文件，同名文件不会被覆盖。"
                  : "可用「灵感收集/新想法.md」创建分组；仅处理 Markdown。"}
            </p>
            <div className="modal-footer">
              <button
                type="button"
                className="secondary-button"
                disabled={fileBusy}
                onClick={() => setDialog(null)}
              >
                取消
              </button>
              <button
                className="gold-button"
                disabled={fileBusy || !dialog.value.trim()}
              >
                {fileBusy ? "处理中…" : "确认"}
              </button>
            </div>
          </form>
        </div>
      )}
      {confirm && (
        <div className="modal-backdrop">
          <div className="modal small-modal">
            <h2>保留当前的手改？</h2>
            <p className="confirm-text">{confirm.text}</p>
            <div className="modal-footer">
              <button
                className="secondary-button"
                onClick={() => setConfirm(null)}
              >
                返回继续编辑
              </button>
              <button
                className="gold-button"
                onClick={() => {
                  const action = confirm.action;
                  setConfirm(null);
                  action();
                }}
              >
                放弃手改并继续
              </button>
            </div>
          </div>
        </div>
      )}
      {help && (
        <div className="modal-backdrop">
          <div className="modal help-modal">
            <div className="simple-modal-heading">
              <h2>从一个想法开始</h2>
              <button
                className="icon-button"
                aria-label="关闭使用指南"
                onClick={() => setHelp(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="help-step">
              <span>01</span>
              <div>
                <h3>按大纲写</h3>
                <p>
                  从顶部「面板」菜单打开独立大纲，为节点填写写作描述，悬停可查看；选择节点写作操作，按这个节点完成内容。「目录」仍可用于章节定位。
                </p>
              </div>
            </div>
            <div className="help-step">
              <span>02</span>
              <div>
                <h3>只改一小处</h3>
                <p>
                  选中正文里的词或句子，按
                  Ctrl+J。演示模式可输入：把“很清楚”改成“足够清楚”。
                </p>
              </div>
            </div>
            <div className="help-step">
              <span>03</span>
              <div>
                <h3>一小段一小段接着写</h3>
                <p>
                  把光标放在要插入的位置，选择「往下续写」图标。每轮只生成一段，字数上限可在设置中调整，等待你采纳或调整。
                </p>
              </div>
            </div>
            <div className="help-step">
              <span>04</span>
              <div>
                <h3>审阅，修改，再继续</h3>
                <p>
                  建议在正文下方预览。采纳后可撤回；目标被手改时会阻止覆盖。Ctrl+S
                  保存，Ctrl+F 查找，Escape 停止请求。
                </p>
              </div>
            </div>
            <p className="settings-note">
              正文主版面始终保留，额外正文可分栏或浮动；顶部「视图 → 面板」管理面板开关，同栏可保存和应用视图。拖动工具面板标题栏，移入箭头或标签目标查看预览，松手完成分栏或合并。右上角小锁固定停靠区位置，仍可打开或收纳面板。顶部「开始」提供文字格式、对齐和查找替换；设置里可选择写作文件夹、续写字数和模型。
            </p>
            <button
              className="gold-button help-done"
              onClick={() => setHelp(false)}
            >
              开始写作
              <ArrowLeft size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
