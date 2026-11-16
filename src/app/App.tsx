import {requestApi} from './api';
import type {DiskFile} from '../shared/fileTypes';
import {hello,type Message} from '../features/chat/chatTypes';
import type {EditorSession} from '../features/editor/editorSessionTypes';
import type {Dialog} from '../features/editor/editorDialogTypes';
import {useDocumentPersistence} from '../features/files/useDocumentPersistence';
import {generateWriting,stopWritingGeneration,type GenerationOptions} from '../features/chat/writingGeneration';
import {createProposalActions} from '../features/chat/proposalActions';
import {runEditorCommand} from '../features/ribbon/editorCommands';
// Load the complete style stack with App, including in already-open Vite sessions.
import "./styles.css";
import "../features/annotations/annotations.css";
import "../features/workspace/workbench-v3.css";
import "../features/workspace/free-workspace.css";
import "../features/workspace/panel-chrome.css";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {WorkspaceProvider, useFileWorkspace, type WorkspaceInfo} from "../features/files/WorkspaceContext";
import type {AnnotationContext} from '../features/editor/EditorContextMenu';
import EditorStatusBar, {useStatusPreferences} from "../features/editor/EditorStatusBar";
import "../features/files/files.css";
import TrashPanel from '../features/files/TrashPanel';
import FileExplorer,{type FileAction,type FileResult} from "../features/files/FileExplorer";
import FilePicker from '../features/files/FilePicker';
import NewTabPage,{NewTabButton} from '../features/editor/NewTabPage';
import {mapEntryPath,type Entry} from "../features/files/explorerState";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { EditorSelection, type EditorState } from "@codemirror/state";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Download,
  FileText,
  FolderOpen,
  Highlighter,
  ListTree,
  Lock,
  ListPlus,
  LockOpen,
  MessageSquare,
  PencilLine,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  Search,
  TextCursorInput,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import Editor, { makeState } from "../features/editor/Editor";
import DisplayModeControl from '../features/editor/DisplayModeControl';
import FindReplacePanel from '../features/editor/FindReplacePanel';
import NotePropertiesDialog from '../features/editor/NotePropertiesDialog';
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
import {matchesViewEditor,remapViewLayout,type ViewSnapshot,type ViewPreset} from "../features/workspace/viewPresets";
import PanelIconRail from "../features/workspace/PanelIconRail";
import type {DockEdge} from "../features/workspace/panelLayout";
import PanelSwitcher,{type PanelCategory} from "../features/workspace/PanelSwitcher";
import WritingModeControl from "../features/chat/WritingModeControl";
import WritingDock from "../features/chat/WritingDock";
import {useReferenceSources,normalizeReferenceSources,type ReferenceSource} from '../features/chat/referenceSources';
import {useModelReasoning} from '../features/chat/modelReasoning';
import ChatComposer from "../features/chat/ChatComposer";
import InputBasisPanel,{type InputBasisRequest} from '../features/chat/InputBasisPanel';
import WorkspaceTabs from "../features/workspace/WorkspaceTabs";
import RailEdgeHandle from "../features/workspace/RailEdgeHandle";
import SettingsPage, {type SettingsSection} from "../features/settings/SettingsPage";
import {initialConfig, parseModelChoice, activeModelLabel, type Config} from "../features/settings/modelConfig";
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
import {
  type AnnotationSource,
  type TextAnnotation,
} from "../features/annotations/annotations";
import {
  canApply,
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
  const [info,setInfo]=useState<WorkspaceInfo|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let alive=true;fetch('/api/workspace').then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);if(alive){setInfo(data);setError('');}}).catch(error=>{if(alive)setError(error.message);});return()=>{alive=false;};},[attempt]);
  if(!info)return <div className="workspace-loading" role="status">{error||'正在打开写作空间…'}{error&&<button onClick={()=>setAttempt(value=>value+1)}>重试</button>}</div>;
  return <WorkspaceProvider key={info.id} info={info} onChange={setInfo}><WritingApp/></WorkspaceProvider>;
}
function WritingApp() {
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
  const [filePickerTarget,setFilePickerTarget]=useState<string|null>(null),[newNoteBusy,setNewNoteBusy]=useState(false),[renameRequest,setRenameRequest]=useState<{path:string;key:string}>();
  const creatingNote=useRef(false);
  const activeSession = useRef("editor"), syncingSessions = useRef(false);
  const [activeEditorId, setActiveEditorId] = useState("editor");
  const sessionCallbacks = useRef({update: (_id: string, _update: ViewUpdate) => {}, ready: (_id: string, _view: EditorView | null) => {},prepareScratch:null as (()=>Promise<boolean>)|null});
  const sessionBindings = useRef(new Map<string, {onUpdate:(update:ViewUpdate)=>void;onReady:(view:EditorView|null)=>void}>());
  function bindings(id: string) {
    if (!sessionBindings.current.has(id)) sessionBindings.current.set(id, {onUpdate: update => sessionCallbacks.current.update(id, update), onReady: view => sessionCallbacks.current.ready(id, view)});
    return sessionBindings.current.get(id)!;
  }
  const editorIds = [...sessions.current.keys()];
  function panelLabel(id:string) {
    if(sessions.current.has(id))return sessions.current.get(id)?.landing?'新标签页':sessions.current.get(id)?.disk?.path.split('/').at(-1)||'未命名稿';
    return ({files:'文档',conversation:'对话',outline:'大纲',toc:'标题目录',scratch:'草稿',annotations:'标注',basis:'依据',search:'查找替换',trash:'回收站'} as Record<string,string>)[id]||id;
  }
  const leftPanel = workspace.panel("files"), rightPanel = workspace.panel("conversation");
  const leftOpen = workspace.isOpen("files"), chatOpen = workspace.isOpen("conversation");
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
  const [scratchReady, setScratchReady] = useState(0);
  const [annotationTool,setAnnotationTool]=useState(false);
  useEffect(()=>{
    if(!annotationTool)return;
    const cancel=(event:KeyboardEvent)=>{if(event.key==='Escape')setAnnotationTool(false);};
    document.addEventListener('keydown',cancel);return()=>document.removeEventListener('keydown',cancel);
  },[annotationTool]);
  const [chatTab, setChatTab] = useState<"conversation" | "annotations">(
      "conversation",
    ),
    [annotationInstruction, setAnnotationInstruction] = useState(""),
    [annotationFocus, setAnnotationFocus] = useState(""),
    [chatOrb, setChatOrb] = useState(false);
  const [outline, setOutline] = useState<ReturnType<typeof headings>>([]),
    [selection, setSelection] = useState({ from: 0, to: 0, text: "" }),
    [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState(""),[trashRevision,setTrashRevision]=useState(0);
  const [writingNodeId, setWritingNodeId] = useState<string | null>(null),
    [inlineRequest, setInlineRequest] =
      useState<InlineAnnotationRequest | null>(null);
  const [pendingAnnotationContext,setPendingAnnotationContext]=useState<{source:AnnotationSource;file:string;editor:EditorView;doc:EditorView['state']['doc'];context:AnnotationContext}|null>(null);
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
  const reasoning=useModelReasoning(!config.demo?config.selection:null);
  function addReference(source:ReferenceSource){references.setSources(normalizeReferenceSources([...references.sources,source]));workspace.open('basis');}
  const annotations = useTextAnnotations(
    file,
    view,
    scratchView,
    scratchReady,
    setError,
  );
  const writingOutline = useWritingNodes(file, view, setError);
  const redraw = () => setTick((t) => t + 1);
  const inform = (text: string) => {
    setNotice(text);
  };
  const add = (role: Message["role"], content: string) =>
    setMessages((ms) => [...ms, { id: uid(), role, content }]);
  const {savingPaths,fileConflicts,saveSession,applyDiskFile}=useDocumentPersistence({api,sessions,activeSession,disk,switching,structuring,fileBusy,tick,autoSave:fileWorkspace.info.autoSave,setDirty,setFileBusy,setEntries,setError,inform,redraw});
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
      setDirty(update.state.doc.toString() !== disk.current?.text);
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
    const source=activeTextSource.current,editor=source==='scratch'?scratchView.current:view.current;
    if(!editor)return;
    const id=activeSession.current,path=source==='scratch'?'自由草稿.md':sessions.current.get(id)?.disk?.path||'';
    const target:InsertTarget={editor,file:path,valid:()=>source==='scratch'?scratchView.current===editor:sessions.current.get(id)?.view===editor&&(sessions.current.get(id)?.disk?.path||'')===path,...(source==='scratch'?{prepare:async()=>await sessionCallbacks.current.prepareScratch?.()||false}:{})};
    runEditorCommand(command,{target,onDialog:setDialog,onError:setError,openSearch:()=>{workspace.open('search');requestAnimationFrame(()=>{const input=document.querySelector<HTMLInputElement>('[data-find-input]');input?.focus();input?.select();});}});
  }
  sessionCallbacks.current.ready = (id, next) => {
    const session = sessions.current.get(id)!;
    if (!next && session.view) session.state = session.view.state;
    session.view = next;
    if (next && session.state) next.setState(session.state);
    if(next&&session.restoreScroll!==undefined){const scroll=session.restoreScroll;session.restoreScroll=undefined;requestAnimationFrame(()=>{if(session.view===next)next.scrollDOM.scrollTop=scroll;});}
    if (activeSession.current === id) { view.current = next; editorState.current = session.state; if(next){annotations.syncEditor("document",next,session.disk?.path);setScratchReady(value=>value+1);} }
  };
  sessionCallbacks.current.update = (id, update) => {
    const session = sessions.current.get(id)!;
    session.state = update.state;
    session.dirty = update.state.doc.toString() !== (session.disk?.text || "");
    if (update.docChanged && !syncingSessions.current && session.disk) {
      syncingSessions.current = true;
      try {
        for (const other of sessions.current.values()) {
          if (other.id === id || other.disk?.path !== session.disk.path || !other.state?.doc.eq(update.startState.doc)) continue;
          if (other.view) other.view.dispatch({changes:update.changes,userEvent:"input.shared-document"});
          else {other.state=other.state.update({changes:update.changes}).state;other.dirty=other.state.doc.toString()!==other.disk.text;}
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
    previous.context = {proposal:proposal.current,undo:undo.current,messages,prompt,writingNodeId,lastRequest};
    if (running.current) stop();
    const next = sessions.current.get(id)!;
    activeSession.current=id;
    view.current=next.view; editorState.current=next.state; disk.current=next.disk;
    proposal.current=next.context?.proposal||null; undo.current=next.context?.undo||[];
    setActiveEditorId(id); setFile(next.disk?.path||""); setDirty(next.dirty);
    setMessages(next.context?.messages||[hello]); setPrompt(next.context?.prompt||"");
    setWritingNodeId(next.context?.writingNodeId||null); setLastRequest(next.context?.lastRequest||null);
    setOutline(next.state?headings(next.state):[]);
    const range=next.state?.selection.main;
    setSelection(range&&next.state?{from:range.from,to:range.to,text:next.state.sliceDoc(range.from,range.to)}:{from:0,to:0,text:""});
    setInlineRequest(null);setScratchReady(value=>value+1);setError("");
  }
  function closeEditor(id: string) {
    workspace.close(id);
    if(activeSession.current===id){const next=editorIds.find(value=>value!==id&&workspace.isOpen(value));if(next)workspace.open(next);}
  }
  function minimizeEditor(id:string) {
    workspace.minimize(id);
    if(activeSession.current===id){const next=editorIds.find(value=>value!==id&&workspace.isOpen(value));if(next)workspace.open(next);}
  }
  const refresh = async () => {
    const data = await api<{ root: string; entries: Entry[] }>("/tree");
    setEntries(data.entries);
    setRoot(data.root);
  };
  function stop() {
    stopWritingGeneration({generation,controller,requestAnchor,running,proposal},{setBusy,setStream});
  }
  function showFile(data: DiskFile, targetId = activeSession.current) {
    if (targetId !== activeSession.current) {
      const session=sessions.current.get(targetId);
      if (!session) return;
      session.landing=false;
      const shared=[...sessions.current.values()].find(value=>value.id!==targetId&&value.disk?.path===data.path&&value.state);
      session.disk=shared?.disk?{...shared.disk}:data;
      session.state=makeState(shared?.state?.doc.toString()??data.text,bindings(targetId).onUpdate);
      session.dirty=session.state.doc.toString()!==session.disk.text;
      session.context=undefined;session.view?.setState(session.state);workspace.open(targetId);redraw();return;
    }
    stop();
    proposal.current = null;
    undo.current = [];
    disk.current = data;
    const session=sessions.current.get(activeSession.current)!;
    session.landing=false;
    const shared=[...sessions.current.values()].find(value=>value.id!==session.id&&value.disk?.path===data.path&&value.state);
    if(shared?.disk) {data={...shared.disk};disk.current=data;}
    const nextState = makeState(shared?.state?.doc.toString() ?? data.text, bindings(session.id).onUpdate);
    session.disk=data; session.state=nextState; session.dirty=nextState.doc.toString()!==data.text;
    workspace.open(session.id);
    editorState.current = nextState;
    view.current?.setState(nextState);
    annotations.syncEditor("document",view.current,data.path);
    setFile(data.path);
    setWritingNodeId(null);
    setInlineRequest(null);
    setDirty(session.dirty);
    setOutline(view.current ? headings(view.current.state) : []);
    setSelection({ from: 0, to: 0, text: "" });

    activeTextSource.current = "document";
    setMessages([hello]);
    setLastRequest(null);
    setPrompt("");
    setError("");
    setStream("");
    redraw();
  }
  async function openFile(path: string) {
    const targetId=activeSession.current;
    setFileBusy(true);
    try {
      showFile(await api<DiskFile>("/file?path=" + encodeURIComponent(path)),targetId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFileBusy(false);
    }
  }
  function safeSwitch(action: () => void) {
    if (dirty)
      setConfirm({
        text: "当前文档尚未保存。继续会放弃本次手改；也可以取消后先按 Ctrl+S 保存。",
        action,
      });
    else action();
  }
  useEffect(() => {
    let cancelled = false;
    const cleanup = () => {
      cancelled = true;
      generation.current++;
      controller.current?.abort();
    };
    if (disk.current) return cleanup;
    Promise.all([
      api<{ root: string; entries: Entry[] }>("/tree"),
      api<Config>("/config"),
    ])
      .then(async ([tree, cfg]) => {
        if (cancelled) return;
        setEntries(tree.entries);
        setRoot(tree.root);
        setConfig(cfg);
        const flatten = (items: Entry[]): Entry[] =>
          items.flatMap((e) =>
            e.type === "file" ? [e] : flatten(e.children || []),
          );
        const first =
          flatten(tree.entries).find((e) => e.name === "开始写作.md") ||
          flatten(tree.entries)[0];
        if (first) {
          const data = await api<DiskFile>(
            "/file?path=" + encodeURIComponent(first.path),
          );
          if (!cancelled) showFile(data);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return cleanup;
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
      if ([...sessions.current.values()].some(session => session.dirty)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'&&!document.querySelector('[role="dialog"],dialog[open]')&&!(event.target as HTMLElement).closest('input,textarea')){event.preventDefault();ribbonCommand('find');return;}
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
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
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  function openSaveAs(path=file||'未命名.md') {if(path)setDialog({kind:'saveAs',title:'另存为 Markdown',value:path.replace(/\.md$/i,'-副本.md')});}

  async function save(){await saveSession(activeSession.current);}
  function openBlankTab(sourceId:string){
    if(structuring.current||switching.current||viewApplying.current||creatingNote.current||running.current){setError('请等待当前操作完成后再新建标签页。');return;}
    if(workspace.openIds.filter(id=>sessions.current.has(id)).length>=48){setError('打开的文档标签已达 48 个，请先关闭不再使用的标签页。');return;}
    const source=sessions.current.get(sourceId),id='editor:'+uid();
    sessions.current.set(id,{id,disk:null,state:null,view:null,dirty:false,landing:true,typewriter:source?.typewriter,displayMode:source?.displayMode});
    activeTextSource.current='document';
    workspace.openDocumentTab(id,sourceId);redraw();
  }
  async function openInLanding(path:string,id:string){
    if(!sessions.current.get(id)?.landing)throw new Error('这个新标签页已经打开文档，请重新选择标签页。');
    if(structuring.current||switching.current||viewApplying.current||running.current)throw new Error('请等待当前操作完成后再打开文件。');
    await fileWorkspace.flush();
    const data=await api<DiskFile>('/file?path='+encodeURIComponent(path));
    if(!sessions.current.get(id)?.landing)throw new Error('标签页已变化，请重试。');
    showFile(data,id);workspace.open(id);
  }
  async function createInLanding(id:string){
    if(creatingNote.current||!sessions.current.get(id)?.landing)return;
    creatingNote.current=true;setNewNoteBusy(true);
    try{
      const result=await manageFile({action:'create',parent:'',type:'file'});
      await openInLanding(result.path,id);workspace.open('files');
      setFilter('');setRenameRequest({path:result.path,key:uid()});
    }catch(error){setError((error as Error).message);}finally{creatingNote.current=false;setNewNoteBusy(false);}
  }
  async function openExplorerFile(path:string,newTab=false){
    if(structuring.current||running.current)throw new Error('请等待文件操作完成或停止 AI 生成后再打开。');
    await fileWorkspace.flush();
    if(!newTab){
      const current=sessions.current.get(activeSession.current)!;
      if(current.dirty&&!await saveSession(current.id,true))throw new Error('当前文档尚未保存，请先处理保存冲突或另存未命名稿。');
      if(proposal.current||prompt.trim())throw new Error('请先处理当前未发送的消息和待审建议，或在新标签页中打开文件。');
      showFile(await api<DiskFile>('/file?path='+encodeURIComponent(path)));return;
    }
    const data=await api<DiskFile>('/file?path='+encodeURIComponent(path)),id='editor:'+uid();
    sessions.current.set(id,{id,disk:null,state:null,view:null,dirty:false});
    showFile(data,id);workspace.openDocumentTab(id);redraw();
  }
  async function manageFile(action:FileAction):Promise<FileResult>{
    if(structuring.current||switching.current||viewApplying.current||savingPaths.current.size)throw new Error('正在保存或切换工作区，请稍后重试。');
    if(action.action==='reveal')return api<FileResult>('/explorer',action);
    if(running.current)throw new Error('请先停止 AI 生成，再整理文件。');
    const affected=[...sessions.current.values()].filter(session=>session.disk&&action.path&&(session.disk.path===action.path||session.disk.path.startsWith(action.path+'/')));
    if(['move','rename','trash'].includes(action.action)&&affected.some(session=>session.id===activeSession.current?proposal.current:session.context?.proposal))throw new Error('请先处理这个文件的待审建议，再整理文件。');
    await fileWorkspace.flush();
    for(const session of affected)if(session.dirty&&!await saveSession(session.id,true))throw new Error('文件未能保存，请先处理冲突后再整理。');
    if(savingPaths.current.size)throw new Error('文件正在保存，请稍后重试。');
    structuring.current=true;setFileBusy(true);
    try{
      const result=await api<FileResult>('/explorer',action);
      if(action.path&&['move','rename'].includes(action.action)){
        references.remap(action.path,result.path);
        for(const session of affected){session.disk={...session.disk!,path:mapEntryPath(session.disk!.path,action.path,result.path)};if(session.context){session.context.proposal=null;session.context.undo=[];}}
        const current=sessions.current.get(activeSession.current)!;disk.current=current.disk;setFile(current.disk?.path||'');
        setCollapsed(old=>new Set([...old].map(path=>mapEntryPath(path,action.path!,result.path))));
        setInlineRequest(null);undo.current=[];proposal.current=null;
      }
      if(action.action==='trash'){
        for(const session of affected){session.disk=null;session.dirty=!!session.state?.doc.length;session.context=undefined;if(session.id!=='editor')workspace.close(session.id);}
        if(affected.some(session=>session.id===activeSession.current)){const current=sessions.current.get(activeSession.current)!;disk.current=null;setFile('');setDirty(current.dirty);proposal.current=null;undo.current=[];setLastRequest(null);setInlineRequest(null);}
        setTrashRevision(value=>value+1);
        inform('已移到回收站，可从文档列表的回收站恢复。已打开的文字保留为未命名稿。');
      }
      await refresh();redraw();return result;
    }finally{structuring.current=false;setFileBusy(false);}
  }

  function reloadFromDisk(id:string) {
    const session=sessions.current.get(id);if(!session?.disk)return;
    const path=session.disk.path;
    setConfirm({text:'重新读取会放弃这个文件在所有正文区中尚未保存的修改。可先另存本地副本。',action:()=>{
      void api<DiskFile>('/file?path='+encodeURIComponent(path)).then(applyDiskFile).catch(error=>setError(error.message));
    }});
  }
  async function switchWorkspace(root:string) {
    if(viewApplying.current)throw new Error('视图正在应用，请稍后再切换写作空间。');
    if(switching.current)return;switching.current=true;
    try{
      if([...sessions.current.values()].some(session=>session.id===activeSession.current?prompt.trim()||proposal.current:session.context?.prompt.trim()||session.context?.proposal))throw new Error('请先处理未发送的消息和待审建议，再切换写作空间。');
      if(running.current)throw new Error('请先停止当前 AI 生成，再切换写作空间。');
      if(savingPaths.current.size)throw new Error('文件正在保存，请稍后再切换。');
      await fileWorkspace.flush();
      for(const session of sessions.current.values())if(session.dirty&&!await saveSession(session.id,true))throw new Error('有文件未能保存，请先处理冲突或另存副本，再切换文件夹。');
      await fileWorkspace.update({root});
    }finally{switching.current=false;}
  }
  function captureView():ViewSnapshot {
    const layout=workspace.capture(),included=new Set([...layout.open,...layout.minimized,activeSession.current]);
    return {layout,editors:[...sessions.current.values()].filter(session=>included.has(session.id)).map(session=>{
      const state=session.view?.state||session.state,range=state?.selection.main;
      return {id:session.id,file:session.disk?.path||null,anchor:range?.anchor||0,head:range?.head||0,scrollTop:session.view?.scrollDOM.scrollTop||0,typewriter:!!session.typewriter,displayMode:session.displayMode||'live',landing:!!session.landing};
    }),activeEditor:activeSession.current,appearance:{...appearanceSettings.appearance},statusItems:[...statusPreferences.items],statusCountMode:statusPreferences.countMode,filter,collapsed:[...collapsed],chatOrb,orbPosition:orbPosition.current?{...orbPosition.current}:undefined,orbBounds:{...orbBounds.current}};
  }
  async function applyView(saved:ViewPreset) {
    if(workspace.locked)throw new Error('请先解锁工作区位置，再应用其他视图。');
    if(viewApplying.current)throw new Error('视图正在应用，请稍后再试。');
    viewApplying.current=true;
    try {
    if(saved.mode!==mode)throw new Error('请在这个视图所属的写作模式中应用。');
    if(fileBusy||switching.current)throw new Error('文件正在载入或保存，请稍后应用视图。');
    if(running.current)throw new Error('请先停止当前生成，再应用视图。');
    const mapping=new Map<string,string>(),used=new Set<string>(),created:EditorSession[]=[],missing=new Set<string>();
    for(const descriptor of saved.editors){
      const same=[...sessions.current.values()].find(session=>!used.has(session.id)&&session.id===descriptor.id&&matchesViewEditor(session,descriptor))
        ||[...sessions.current.values()].find(session=>!used.has(session.id)&&matchesViewEditor(session,descriptor));
      const id=same?.id||'editor:'+uid();mapping.set(descriptor.id,id);used.add(id);
      if(!same&&descriptor.file&&![...sessions.current.values()].some(session=>session.disk?.path===descriptor.file))missing.add(descriptor.file);
    }
    const paths=[...missing],results=await Promise.allSettled(paths.map(path=>api<DiskFile>('/file?path='+encodeURIComponent(path)))),loaded=new Map<string,DiskFile>();
    const failed:string[]=[];results.forEach((result,index)=>{if(result.status==='fulfilled')loaded.set(paths[index],result.value);else failed.push(paths[index]+'：'+result.reason.message);});
    if(failed.length)throw new Error('暂时无法恢复这个视图的文档。'+failed.slice(0,3).join('；'));
    if(!appAlive.current||currentMode.current!==saved.mode)throw new Error('写作模式或空间已经变化，请重新选择视图。');
    for(const descriptor of saved.editors){const existing=sessions.current.get(mapping.get(descriptor.id)!);if(existing&&!matchesViewEditor(existing,descriptor))throw new Error('打开的文档已变化，请重新应用视图。');}
    for(const descriptor of saved.editors){
      const id=mapping.get(descriptor.id)!;if(sessions.current.has(id))continue;
      const source=[...sessions.current.values(),...created].find(session=>session.disk?.path===descriptor.file),data=source?.disk||loaded.get(descriptor.file||'')||null;
      const text=source?(source.view?.state||source.state)?.doc.toString()||'':data?.text||'';
      const state=makeState(text,bindings(id).onUpdate),anchor=Math.min(descriptor.anchor,state.doc.length),head=Math.min(descriptor.head,state.doc.length);
      created.push({id,disk:data?{...data}:null,state:state.update({selection:{anchor,head}}).state,view:null,dirty:text!==(data?.text||''),restoreScroll:descriptor.scrollTop,landing:!!descriptor.landing});
    }
    created.forEach(session=>sessions.current.set(session.id,session));
    activateEditor(mapping.get(saved.activeEditor)!);
    for(const descriptor of saved.editors){
      const session=sessions.current.get(mapping.get(descriptor.id)!)!,state=session.view?.state||session.state;session.typewriter=descriptor.typewriter===true;session.displayMode=descriptor.displayMode||'live';if(!state)continue;
      const selection={anchor:Math.min(descriptor.anchor,state.doc.length),head:Math.min(descriptor.head,state.doc.length)};
      if(session.view){const editor=session.view;editor.dispatch({selection});requestAnimationFrame(()=>{if(session.view===editor)editor.scrollDOM.scrollTop=descriptor.scrollTop;});}
      else {session.state=state.update({selection}).state;session.restoreScroll=descriptor.scrollTop;}
    }
    workspace.restoreLayout(remapViewLayout(saved.layout,mapping));
    appearanceSettings.setAppearance({...saved.appearance});statusPreferences.setOptions({items:[...saved.statusItems],countMode:saved.statusCountMode||'characters'});
    setFilter(saved.filter);setCollapsed(new Set(saved.collapsed));setChatOrb(saved.chatOrb);orbPosition.current=saved.orbPosition?{...saved.orbPosition}:undefined;orbBounds.current={...saved.orbBounds};redraw();
    } finally {viewApplying.current=false;}
  }
  function openSettings(section:SettingsSection='models') {setSettingsSection(section);setSettings(true);}
  async function updateSettings(route:string,body:unknown) {
    setConfigBusy(true);
    try {setConfig(await api<Config>(route,body));}
    finally {setConfigBusy(false);}
  }
  async function selectChatModel(choice: string) {
    if(choice==='settings'){openSettings('models');return;}
    setError('');
    try {await updateSettings('/config',{revision:config.revision,demo:choice==='demo',...(choice==='demo'?{}:{selection:parseModelChoice(choice)})});}
    catch(error){setError((error as Error).message);}
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
  function markText(source:AnnotationSource=activeTextSource.current,expectedFile=source==='document'?disk.current?.path:undefined) {
    try {
      const id = annotations.mark(source,expectedFile);
      setAnnotationFocus(id);
      setInlineRequest({ id, ids:[...annotations.lastMarkedIds.current], nonce: uid(), focus: true });
    } catch (error) {
      setError((error as Error).message);
    }
  }
  function showLocalAnnotation(source:AnnotationSource,context:AnnotationContext,expectedFile?:string){
    const editor=source==='document'?view.current:scratchView.current;
    if(!editor)return;
    setPendingAnnotationContext({source,file:source==='document'?expectedFile||'':'自由草稿',editor,doc:editor.state.doc,context});
  }
  useEffect(()=>{
    const pending=pendingAnnotationContext;if(!pending)return;
    const editor=pending.source==='document'?view.current:scratchView.current;
    if(editor!==pending.editor||editor.state.doc!==pending.doc){setPendingAnnotationContext(null);setError('选区或正文已变化，请重新选择。');return;}
    if(pending.source==='document'&&(file!==pending.file||!annotations.ready))return;
    const nonempty=pending.context.ranges.filter(range=>range.to>range.from);
    const matches=annotations.items.filter(item=>item.source===pending.source&&item.file===pending.file&&!item.stale&&(
      nonempty.length?nonempty.some(range=>item.from<range.to&&item.to>range.from):pending.context.ids.length?pending.context.ids.includes(item.id):pending.context.ranges.some(range=>item.from<=range.from&&range.from<item.to)));
    setPendingAnnotationContext(null);
    if(matches.length){const item=matches[0];setInlineRequest({id:item.id,nonce:uid(),focus:false});return;}
    if(nonempty.length){editor.dispatch({selection:EditorSelection.create(nonempty.map(range=>EditorSelection.range(range.from,range.to)))});markText(pending.source,pending.source==='document'?pending.file:undefined);return;}
    setError('请先选择文字或在已有标注处打开。');
  },[pendingAnnotationContext,file,annotations.items,annotations.ready]);
  function unmarkText(source:AnnotationSource=activeTextSource.current,annotationId?:string,expectedFile=source==='document'?disk.current?.path:undefined){
    try{annotations.unmark(source,annotationId,expectedFile);setInlineRequest(null);}
    catch(error){setError((error as Error).message);}
  }
  function locateAnnotation(item: TextAnnotation) {
    try {
      if (item.source === "scratch") {
        chooseSidebar("scratch");
      } else workspace.open(activeSession.current);
      if (item.stale) {
        const editor=item.source==='scratch'?scratchView.current:view.current;
        if(editor){const pos=Math.min(item.from,editor.state.doc.length);editor.dispatch({selection:{anchor:pos},effects:EditorView.scrollIntoView(pos,{y:'center'})});editor.focus();}
      } else annotations.locate(item);
      setInlineRequest({ id: item.id, nonce: uid(), focus: false });
    } catch (error) {
      setError((error as Error).message);
    }
  }
  function reanchorAnnotation(item: TextAnnotation) {
    try {
      annotations.reanchor(item);
    } catch (error) {
      setError((error as Error).message);
    }
  }
  function sendAnnotations(ids: string[]) {
    try {
      const submitted = annotations.submission(ids);
      openChat("conversation");
      void generate({
        annotations: submitted,
        instruction: annotationInstruction,
      });
    } catch (error) {
      setError((error as Error).message);
    }
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

  function generate(options?:GenerationOptions) {
    return generateWriting({
      document:{view,disk,sessions,activeSession,file,outline,currentHeading,currentWritingNode},
      model:{config,reasoningEffort:reasoning.effort},
      conversation:{mode,prompt,messages,setPrompt,setLastRequest,add},
      lifecycle:{running,generation,controller,requestAnchor,proposal},
      references,writingOutline,request,annotationResponded:annotations.responded,
      ui:{setError,setBusy,setStream,openPanel:workspace.open,inform,redraw},
    },options);
  }
  const {accept,reject,undoAI}=createProposalActions({view,disk,proposal,undo,writingOutline,add,setError,inform,redraw,setMode,setPrompt,openChat:()=>openChat('conversation'),promptRef});

  
  async function submitDialog(event: FormEvent) {
    event.preventDefault();
    if (!dialog||dialog.kind==='image'||dialog.kind==='table'||dialog.kind==='properties') return;
    let path = dialog.value.trim().replace(/\\/g, "/");
    if (!path) return;
    setFileBusy(true);
    setError("");
    try {
      if (dialog.kind === "folder") {
        await api("/folder", { path });
      } else if (dialog.kind === "rename") {
        if (!disk.current) throw new Error("请先打开文档。");
        const data = await api<DiskFile>("/rename", {
          from: disk.current.path,
          to: path.endsWith(".md") ? path : path + ".md",
          baseline: disk.current.hash,
        });
        showFile(data);
      } else {
        if (!path.endsWith(".md")) path += ".md";
        const text =
          dialog.kind === "saveAs"
            ? view.current?.state.doc.toString() || ""
            : `# ${path.split("/").at(-1)!.replace(/\.md$/, "")}\n\n`;
        await api("/file", {
          path,
          text,
          baseline: null,
          eol: disk.current?.eol || "LF",
          bom: false,
        });
        await openFile(path);
      }
      await refresh();
      setDialog(null);
      inform(dialog.kind === "folder" ? "文件夹已建立。" : "已完成。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFileBusy(false);
    }
  }
  async function importFile(source: File) {
    if (!/\.md$/i.test(source.name)) {
      setError("请选择 Markdown（.md）文件。");
      return;
    }
    if (source.size > 2000000) {
      setError("文件超过 2 MB。");
      return;
    }
    try {
      const raw = await source.text();
      await api("/file", {
        path: source.name,
        text: raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n"),
        baseline: null,
        eol: raw.includes("\r\n") ? "CRLF" : "LF",
        bom: raw.startsWith("\uFEFF"),
      });
      await refresh();
      await openFile(source.name);
      inform("已将文件副本导入工作空间。");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function iconRail(edge:DockEdge){
    const icons:Record<string,typeof FileText>={files:FolderOpen,conversation:MessageSquare,outline:ListTree,toc:ListTree,scratch:PencilLine,annotations:Highlighter,basis:FileText,search:Search,trash:Trash2};
    const items=workspace.autoHideItems.filter(item=>item.edge===edge).map(item=>({...item,label:panelLabel(item.id),Icon:sessions.current.has(item.id)?FileText:icons[item.id]||FileText,number:sessions.current.has(item.id)?editorIds.indexOf(item.id)+1:undefined}));
    if(!items.length)return null;
    const scale=appearanceSettings.appearance.uiScale/100;
    return <div className="rail-edge-wrap"><PanelIconRail minimumTriggerMs={panelIconDragPreferences.preferences.minimumTriggerMs} holdDelayMs={panelIconDragPreferences.preferences.holdDelayMs} holdStyle={panelIconDragPreferences.preferences.holdStyle} edge={edge} items={items} scale={scale} onToggle={workspace.toggleAutoHide} onMove={workspace.repositionAutoHide} onDock={workspace.openDocked}/>{(edge==='left'||edge==='right')&&<RailEdgeHandle edge={edge} scale={scale} disabled={!workspace.canPullRail(edge)} onCommit={width=>workspace.dockAutoHideRail(edge,width)}/>}</div>;
  }
  function panelControls(id:string,groupMembers?:string[]) {
    const panel=workspace.panel(id),isEditor=sessions.current.has(id);
    const label=isEditor?`正文 ${editorIds.indexOf(id)+1}`:panelLabel(id);
    const primary=groupMembers?.includes('editor')||panel.primary;
    const close=()=>{for(const member of groupMembers||[id])sessions.current.has(member)?closeEditor(member):workspace.panel(member).close();};
    const minimize=()=>{for(const member of groupMembers||[id])sessions.current.has(member)?minimizeEditor(member):workspace.panel(member).minimize();};
    const controls=<PanelControl label={label} floating={panel.floating} primary={primary} movable={groupMembers?groupMembers.every(member=>workspace.panel(member).movable):panel.movable} canDock={panel.canDock} onToggleFloat={groupMembers?()=>workspace.groupFloat(id):panel.toggleFloat} onOpen={groupMembers?()=>workspace.groupDock(id):panel.openDocked} collapseEdge={panel.collapseEdge}
      onClose={close} onMinimize={minimize}
      memberActions={groupMembers?[
        {label:'单独浮动',disabled:panel.primary||!panel.movable,run:panel.openFloating},
        {label:'收纳当前窗口',disabled:panel.primary,run:isEditor?()=>minimizeEditor(id):panel.minimize},
        {label:'关闭当前窗口',disabled:panel.primary,run:isEditor?()=>closeEditor(id):panel.close},
        {label:'打开当前窗口并停靠',disabled:panel.primary||!panel.canDock,run:panel.openDocked},
      ]:undefined}
      actions={isEditor?[
        {label:'插入笔记属性',icon:<ListPlus size={14}/>,disabled:!sessions.current.get(id)?.view,run:()=>{activateEditor(id);activeTextSource.current='document';ribbonCommand('properties');}},
        {label:'标题目录',icon:<ListTree size={14}/>,checked:workspace.isOpen('toc'),run:()=>{activateEditor(id);workspace.toggle('toc');}},
      ]:[]}/>;
    return isEditor?<div className="document-panel-controls"><DisplayModeControl label={label} displayMode={sessions.current.get(id)?.displayMode||'live'} onDisplayMode={mode=>{sessions.current.get(id)!.displayMode=mode;redraw();}} typewriter={!!sessions.current.get(id)?.typewriter} onTypewriter={enabled=>{sessions.current.get(id)!.typewriter=enabled;redraw();}}/>{controls}</div>:controls;
  }
  const emptyPanelFooter=(title:string)=><div className="panel-status-footer panel-status-footer-empty" aria-label={`${title}底栏`}/>;
  function renderPanel(id: string, title: string, children: React.ReactNode, className: string) {
    const panel = workspace.panel(id);
    return <aside key={id} ref={panel.ref} data-panel-id={id} aria-label={`${title}面板`}
      className={`workspace-panel independent-workspace-panel ${className} ${panel.grouped?'panel-grouped':''} ${panel.floating ? "panel-floating" : "panel-docked"}`}
      style={panel.style} onPointerDownCapture={panel.raise}>
      <div className="independent-panel-header panel-drag-header" data-lock-panel={id} data-position-locked={panel.positionLocked||undefined} title={panel.lockHint} onPointerDown={panel.beginDrag}>
        <b>{title}</b>{panelControls(id)}
      </div>{children}{id!=="scratch"&&emptyPanelFooter(title)}{panel.handles}</aside>;
  }
  const stale = p
    ? !canApply(p, view.current?.state.doc.toString() || "", file)
    : false;
  return (
    <div className="app-shell" data-revision={tick}>
      <header className="app-header">
        <div className="header-workspace">
        <div className="user-avatar" aria-label="用户头像">我</div>
        <button
          className="workspace-switcher"
          title="写作空间设置"
          aria-label="写作空间设置"
          onClick={() => {
            openSettings('workspace');
          }}
        >
          <b>我的写作空间</b>
          <ChevronDown size={13} />
        </button>
        <div className="quick-file-actions" aria-label="文档保存操作">
          <div className="save-with-autosave">
            <button type="button" className="header-save-button" aria-label="保存正文" title="保存 · Ctrl+S" disabled={!file||fileBusy} onClick={()=>void save()}><Save size={16}/></button>
            <label className="auto-save-toggle" title={fileWorkspace.info.autoSave?'自动保存已开启 · 点击关闭':'自动保存已关闭 · 点击开启'}><input type="checkbox" role="switch" aria-label="自动保存正文" checked={fileWorkspace.info.autoSave} onChange={event=>void fileWorkspace.update({autoSave:event.target.checked}).catch(error=>setError(error.message))}/></label>
          </div>
          <button type="button" className="header-save-as" aria-label="另存为" title="另存为 Markdown" disabled={fileBusy||!editorState.current?.doc.length} onClick={()=>openSaveAs()}><Download size={16}/></button>
        </div>
        </div>
        <div className="header-actions">

          <button
            className={"connection " + (!config.demo ? "live" : "")}
            onClick={() => {
              openSettings('models');
            }}
          >
            <i />
            {activeModelLabel(config)}
            <ChevronDown size={12} />
          </button>
          <span className="header-divider" />
          <PanelSwitcher items={[
            {id:"files",label:"文档（文件列表）",open:leftOpen,category:'files',keywords:['目录','文件夹','浏览器']},
            {id:"trash",label:"回收站",open:workspace.isOpen('trash'),category:'files',keywords:['恢复','删除','清理']},
            ...editorIds.map(id=>({id,label:panelLabel(id),open:workspace.isOpen(id),fixed:id==='editor',category:'documents',description:`正文 ${editorIds.indexOf(id)+1}`,keywords:['笔记','文章','Markdown']})),
            {id:"conversation",label:"对话",open:chatOpen,category:'ai',keywords:['聊天','模型']},
            {id:"annotations",label:"标注",open:workspace.isOpen("annotations"),category:'writing',keywords:['选区','批注']},
            {id:"outline",label:"大纲",open:workspace.isOpen("outline"),category:'writing',keywords:['节点','章节']},
            {id:"toc",label:"标题目录",open:workspace.isOpen("toc"),category:'writing',keywords:['标题','导航']},
            {id:"scratch",label:"草稿",open:workspace.isOpen("scratch"),category:'writing',keywords:['草稿纸','临时']},
            {id:"basis",label:"依据",open:workspace.isOpen("basis"),category:'ai',keywords:['参考','资料','上下文']},
            {id:"search",label:"查找替换",open:workspace.isOpen("search"),category:'tools',keywords:['查找','搜索','替换']},
          ].map(item=>({...item,category:item.category as PanelCategory,locked:workspace.isPositionLocked(item.id)}))} onToggleLock={workspace.togglePositionLock} onReveal={id=>{workspace.open(id);workspace.panel(id).raise();if(sessions.current.has(id))activateEditor(id);requestAnimationFrame(()=>{const element=workspace.panel(id).ref.current;if(element){element.tabIndex=-1;element.focus({preventScroll:true});element.classList.add('panel-located');setTimeout(()=>element.classList.remove('panel-located'),1200);}});}} onToggle={id=>{
            if(sessions.current.has(id)){
              if(workspace.isOpen(id))closeEditor(id);else{workspace.open(id);activateEditor(id);}
            } else if(id==="conversation") {
              if(chatOpen)workspace.close(id);else openChat("conversation");
            } else workspace.toggle(id);
          }}/>
          <button
            className="icon-button"
            title="使用指南"
            aria-label="使用指南"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={17} />
          </button>
          <button
            className={'icon-button workspace-lock-button'+(workspace.locked?' active':'')}
            title={workspace.locked?'解锁工作区位置 · 面板仍可打开和收纳':'锁定工作区位置 · 浮窗仍可移动'}
            aria-label={workspace.locked?'解锁工作区位置':'锁定工作区位置'}
            aria-pressed={workspace.locked}
            onClick={workspace.toggleLocked}
          >{workspace.locked?<Lock size={16}/>:<LockOpen size={16}/>}</button>
          <button
            className="icon-button"
            title="设置"
            aria-label="设置"
            onClick={() => {
              openSettings('appearance');
            }}
          >
            <Settings2 size={17} />
          </button>
        </div>
      </header>
      <Ribbon visible={appearanceSettings.appearance.ribbonVisible} collapsed={appearanceSettings.appearance.ribbonCollapsed}
        onCommand={ribbonCommand} editorReady={activeTextSource.current==='scratch'?workspace.isOpen('scratch')&&!!scratchView.current:!!view.current}
        onCollapsedChange={value=>appearanceSettings.setAppearance(old=>({...old,ribbonCollapsed:value}))}
        onVisibilityChange={value=>{appearanceSettings.setAppearance(old=>({...old,ribbonVisible:value}));if(!value){inform('已隐藏顶部编辑栏，可在设置 → 外观中重新显示。');document.querySelector<HTMLButtonElement>('button[aria-label="设置"]')?.focus();}}}
        onSettings={()=>openSettings('appearance')} viewControls={<ViewControls mode={mode} workspaceId={fileWorkspace.info.id} onCapture={captureView} onApply={applyView}/>}/>
      <div className="workbench-host nearby-workbench-host">
        <div className="nearby-workbench-middle">
        {iconRail('left')}
      <div className="workbench free-workbench" ref={workbenchRef}>
        <aside
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
            {panelControls('files')}
          </div>
          <div
            className="sidebar-content"
            id="sidebar-panel-files"
            aria-label="文档列表"
          >
            <FileExplorer entries={entries} workspaceId={fileWorkspace.info.id} root={root} file={file} dirty={dirty} filter={filter} setFilter={setFilter} collapsed={collapsed} setCollapsed={setCollapsed} renameRequest={renameRequest}
              onOpen={openExplorerFile} onAction={manageFile}
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
        </aside>
        {editorIds.map((id,index)=>{
          const session=sessions.current.get(id)!,documentPanel=workspace.panel(id);
          return (        <main key={id} data-panel-id={id} aria-label={`正文编辑区 ${index+1}`}
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
            <div className="document-tab" title={session.landing?'新标签页':session.disk?.path||'未命名稿'}>
              <span>{session.landing?'新标签页':session.disk?.path.split("/").at(-1) || "未命名稿"}</span>
              {session.dirty && <i className="dirty-dot" />}
            </div>
            <NewTabButton onClick={()=>openBlankTab(id)} disabled={busy||newNoteBusy||fileBusy}/>
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
            {panelControls(id)}
          </div>
          {session.disk&&fileConflicts[session.disk.path]&&<div className="file-conflict" role="alert"><span>{fileConflicts[session.disk.path]}</span><button type="button" onClick={()=>reloadFromDisk(id)}>重新读取磁盘</button><button type="button" onClick={()=>{activateEditor(id);openSaveAs(session.disk!.path);}}>另存本地副本</button></div>}
          {session.landing?<><NewTabPage active={activeEditorId===id} busy={newNoteBusy||fileBusy} onCreate={()=>void createInLanding(id)} onOpen={()=>setFilePickerTarget(id)}/>{emptyPanelFooter("新标签页")}</>:<>
                <Editor documentFile={session.disk?.path||''} annotationTool={annotationTool} searchActive={workspace.isOpen('search')&&activeEditorId===id&&activeTextSource.current==='document'} onFind={()=>{activateEditor(id);activeTextSource.current='document';ribbonCommand('find');}} displayMode={session.displayMode||'live'} typewriter={!!session.typewriter} onReady={bindings(id).onReady} onUpdate={bindings(id).onUpdate} onFocus={()=>{if(activeTextSource.current!=='document'){activeTextSource.current='document';redraw();}}} onMarkSelection={()=>{activateEditor(id);markText('document',sessions.current.get(id)?.disk?.path||'');}} onUnmarkSelection={annotationId=>{activateEditor(id);unmarkText('document',annotationId,sessions.current.get(id)?.disk?.path||'');}} onShowAnnotations={context=>{activateEditor(id);showLocalAnnotation('document',context,sessions.current.get(id)?.disk?.path||'');}} onError={setError}/>
          {activeEditorId === id && p && (
            <section
              className={"review-panel " + (stale ? "stale" : "")}
              aria-label="AI 建议审阅"
            >
              <div className="review-heading">
                <Sparkles size={15} />
                <b>{stale ? "建议已过时" : "待审阅建议"}</b>
                <span>
                  {modeLabels[p.mode]} · {p.count} 字
                </span>
                <button className="text-button" onClick={() => locate(p.from)}>
                  定位正文
                  <TextCursorInput size={13} />
                </button>
              </div>
              <p className="review-reason">
                {stale
                  ? "目标范围在生成后发生了手改，已阻止覆盖。请重新生成。"
                  : p.reason}
              </p>
              <div
                className={"diff-grid " + (!p.original ? "insert-only" : "")}
              >
                {p.original && (
                  <div className="diff-before">
                    <small>原文 · 仅此选区</small>
                    <p>{p.original}</p>
                  </div>
                )}
                <div className="diff-after">
                  <small>
                    {p.original ? "建议替换" : "建议插入"} · {p.node}
                  </small>
                  <p>{p.text.trim() || "（删除此处）"}</p>
                </div>
              </div>
              <div className="review-actions">
                <span>采纳前，正文保持当前内容</span>
                <button className="text-button" onClick={() => reject(true)}>
                  继续调整
                </button>
                <button className="secondary-button" onClick={() => reject()}>
                  <X size={13} />
                  放弃
                </button>
                <button
                  className="gold-button"
                  disabled={stale || busy}
                  onClick={accept}
                >
                  <Check size={14} />
                  采纳建议
                </button>
              </div>
            </section>
          )}
          <EditorStatusBar status={session.disk?`自由写作 · ${session.dirty?'有未保存的修改':'已保存'}`:'未打开文档'} aiStatus={activeEditorId===id?(busy?'AI 正在生成':p?stale?'建议过时，请重新生成':'1 条建议等待审阅':undefined):session.context?.proposal?'1 条建议等待审阅':undefined} state={session.view?.state||session.state} eol={session.disk?.eol} bom={session.disk?.bom} preferences={statusPreferences} onSettings={()=>openSettings('appearance')}/>
          </>}
          {documentPanel.handles}
        </main>
);
        })}
          <aside data-panel-id="conversation" aria-label="对话面板"
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
              <div className="chat-mode-heading">
                <b>{modeLabels[mode]}</b>
              </div>
              {panelControls('conversation')}
            </div>
            <div className="chat-context">
              <FileText size={13} />
              <span>{`正文 ${editorIds.indexOf(activeEditorId)+1}`} · {file.split("/").at(-1) || "未打开文档"}</span>
              <button
                title="查看 AI 实际输入"
                onClick={() => workspace.open('basis')}
              >
                依据
                <ChevronRight size={12} />
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
                <div ref={messagesEnd} />
              </div>
              <div className="chat-bottom">
                <ChatComposer inputRef={promptRef} value={prompt} onChange={setPrompt} onSend={()=>void generate()} onStop={()=>{stop();inform("已停止，正文没有改变。");}}
                  busy={busy} disabled={!file||!!p} placeholder={mode==="edit"?"输入修改要求…":mode==="outline"?"这一节想怎么写…":mode==="continue"?"接下来想写什么…":"输入消息…"}
                  config={config} modelBusy={configBusy} reasoningEffort={reasoning.effort} onReasoningChange={reasoning.setEffort} onModelChange={choice=>void selectChatModel(choice)}/>{reasoning.saveError&&<p role="status">{reasoning.saveError}</p>}
              </div>
            </div>
            {emptyPanelFooter("对话")}
            {rightPanel.handles}
          </aside>
        {renderPanel('toc','标题目录',<TableOfContents key={activeEditorId+':'+file} file={file} items={outline} current={currentHeading?.from} onLocate={locate}/>, 'toc-workspace')}
        {renderPanel("outline", "大纲", <div className="sidebar-content">            <WritingOutline
              key={file}
              items={outline}
              nodes={writingOutline.nodes}
              selectedId={currentWritingNode?.id || null}
              onSelect={setWritingNodeId}
              onSave={writingOutline.save}
              busy={writingOutline.busy}
              ready={writingOutline.ready}
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
</div>, "outline-workspace")}
        {renderPanel("scratch", "草稿", <>            <ScratchPad
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
</>, "scratch-workspace")}
        {renderPanel("annotations", "标注", <>              <AnnotationPanel
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
</>, "annotations-workspace")}
        {renderPanel('basis','依据',<><InputBasisPanel request={lastRequest} file={file} mode={mode} sources={references.sources} entries={entries} workspaceId={fileWorkspace.info.id} onChange={references.setSources}/>{references.saveError&&<p role="status">{references.saveError}</p>}</>,'basis-workspace')}
        {renderPanel('trash','回收站',<TrashPanel open={workspace.isOpen('trash')} refreshKey={trashRevision} onRestore={id=>manageFile({action:'restore',id})} onChanged={()=>setTrashRevision(value=>value+1)}/>,'trash-workspace')}
        {renderPanel('search','查找替换',<FindReplacePanel editor={activeTextSource.current==='scratch'?scratchView.current:view.current} open={workspace.isOpen('search')} onClose={()=>workspace.close('search')} label={activeTextSource.current==='scratch'?'自由草稿.md':file.split('/').at(-1)||'未命名稿'}/>,'find-replace-workspace')}
        {workspace.tabGroups.map(group=><WorkspaceTabs key={group.id} group={group} style={group.style} label={panelLabel} onSelect={workspace.open}
          positionLocked={workspace.isPositionLocked(group.active)} lockHint={workspace.panel(group.active).lockHint} onNewTab={group.panels.every(id=>sessions.current.has(id))?()=>openBlankTab(group.active):undefined} newTabDisabled={busy||newNoteBusy||fileBusy}
          onRaise={workspace.panel(group.active).raise} onDrag={workspace.beginGroupDrag} handles={workspace.panel(group.active).groupHandles} controls={panelControls(group.active,group.panels)}/>)}
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
      <InlineAnnotationEditor
        items={annotations.items}
        request={inlineRequest}
        editorFor={(source) =>
          source === "document" ? view.current : scratchView.current
        }
        onEdit={annotations.edit}
        onSend={sendAnnotations}
        onOpenGlobal={()=>workspace.open('annotations')}
        saving={annotations.saving}
        busy={busy}
        toolActive={annotationTool}
        bubblePlacement={annotationPreferences.preferences.bubblePlacement}
      />
      {appearanceSettings.appearance.floatingToolbarVisible!==false&&<WritingDock mode={mode} continuationLimit={config.continuationLimit} aiOpen={chatOpen} annotationTool={annotationTool}
        onAnnotate={()=>setAnnotationTool(value=>!value)}
        onMode={setMode} onToggleAi={()=>{if(chatOpen)workspace.closePreservingAutoHide('conversation');else {if(workspace.autoHideItems.some(item=>item.id==='conversation')){setChatTab('conversation');setChatOrb(false);workspace.open('conversation');}else openChat('conversation');setTimeout(()=>promptRef.current?.focus(),0);}}}/>}
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
      {settings && <SettingsPage panelIconDragPreferences={panelIconDragPreferences} annotationPreferences={annotationPreferences} config={config} initialSection={settingsSection} appearance={appearanceSettings} statusPreferences={statusPreferences} onSwitchWorkspace={switchWorkspace} busy={configBusy}
        onRequest={updateSettings} onReload={async()=>setConfig(await api<Config>('/config'))} onClose={()=>setSettings(false)}/>}
      {filePickerTarget&&<FilePicker entries={entries} onOpen={async path=>{const id=filePickerTarget;await openInLanding(path,id);requestAnimationFrame(()=>{if(activeSession.current===id)sessions.current.get(id)?.view?.focus();});}} onClose={()=>setFilePickerTarget(null)}/>}
      {dialog?.kind==='properties'&&dialog.target&&<NotePropertiesDialog target={dialog.target} onClose={()=>setDialog(null)} onApplied={()=>{const target=dialog.target!;setDialog(null);requestAnimationFrame(()=>{if(target.valid())target.editor.focus();});inform('笔记属性已应用。');}}/>}
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

