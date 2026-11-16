import {useFileWorkspace} from "../files/WorkspaceContext";
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import Editor, { makeState } from "../editor/Editor";
import { Download, Save } from "lucide-react";
import { minimalReplacement, visibleCount } from "../../shared/core";
type Snapshot = { text: string; hash: string | null };
export default function ScratchPad({
  onError,
  onEditor,
  onEditorUpdate,
  onSaved,
  onOpenFile,
  onMarkSelection,
  onUnmarkSelection,
  onShowAnnotations,
  onEditorFocus,
  onFind,
  searchActive=false,
  annotationTool=false,
  active = false,
}: {
  onError: (message: string) => void;
  onEditor?: (view: EditorView | null,save?:()=>Promise<boolean>) => void;
  onEditorUpdate?: (update: ViewUpdate) => void;
  onSaved?: () => void;
  onOpenFile?: () => void;
  onMarkSelection?:()=>void;
  onUnmarkSelection?:(id?:string)=>void;
  onShowAnnotations?:(context:import('../editor/EditorContextMenu').AnnotationContext)=>void;
  onEditorFocus?:()=>void;
  onFind?:()=>void;
  searchActive?:boolean;
  annotationTool?:boolean;
  active?: boolean;
}) {
  const fileWorkspace=useFileWorkspace(),fetch=fileWorkspace.request;
  const state = useRef<EditorState | null>(null),
    view = useRef<EditorView | null>(null),
    saved = useRef<Snapshot>({ text: "", hash: null }),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    isSaving = useRef(false),
    dirty = useRef(false),
    loaded = useRef(false),
    alive = useRef(true);
  const [status, setStatus] = useState("载入草稿…"),
    [count, setCount] = useState(0),
    [ready, setReady] = useState(false),
    [attempt, setAttempt] = useState(0);
  const errorRef = useRef(onError);
  const callbacks = useRef({ onEditor, onEditorUpdate, onSaved });
  callbacks.current = { onEditor, onEditorUpdate, onSaved };
  errorRef.current = onError;
  const saveRef = useRef<() => Promise<boolean>>(async () => false);
  saveRef.current = async () => {
    if (!state.current || isSaving.current) return false;
    const text = state.current.doc.toString();
    if (text === saved.current.text && saved.current.hash !== null) {
      dirty.current = false;
      setStatus("草稿已保存");
      return true;
    }
    isSaving.current = true;
    setStatus("保存中…");
    try {
      const response = await fetch("/api/scratch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, baseline: saved.current.hash }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      saved.current = { text, hash: data.hash };
      callbacks.current.onSaved?.();
      dirty.current = state.current.doc.toString() !== text;
      if (alive.current) setStatus(dirty.current ? "等待保存…" : "草稿已保存");
      if (dirty.current && alive.current)
        timer.current = setTimeout(() => void saveRef.current(), 500);
      return !dirty.current;
    } catch (error) {
      if (alive.current) {
        setStatus("保存失败 · 可导出备份");
        errorRef.current((error as Error).message);
      }
      return false;
    } finally {
      isSaving.current = false;
    }
  };
  const onUpdate = useCallback((update: ViewUpdate) => {
    state.current = update.state;
    callbacks.current.onEditorUpdate?.(update);
    if (update.docChanged) {
      dirty.current = update.state.doc.toString() !== saved.current.text;
      setCount(visibleCount(update.state.doc.toString()));
      setStatus(dirty.current ? "等待保存…" : "草稿已保存");
      if (timer.current) clearTimeout(timer.current);
      if (dirty.current)
        timer.current = setTimeout(() => void saveRef.current(), 700);
    }
  }, []);
  const onReady = useCallback((next: EditorView | null) => {
    if (!next && view.current) state.current = view.current.state;
    view.current = next;
    if (next && state.current) next.setState(state.current);
    callbacks.current.onEditor?.(next,next?()=>saveRef.current():undefined);
  }, []);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    if (!loaded.current || (active && !dirty.current))
      fetch("/api/scratch")
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          if (cancelled || dirty.current) return;
          saved.current = data;
          loaded.current = true;
          state.current = makeState(data.text, onUpdate, "Markdown 草稿编辑器");
          view.current?.setState(state.current);
          setCount(visibleCount(data.text));
          setStatus("草稿已保存");
          setReady(true);
        })
        .catch((error) => {
          if (!cancelled) {
            setStatus("草稿载入失败");
            errorRef.current(error.message);
          }
        });
    else {
      setReady(true);
      if (dirty.current)
        timer.current = setTimeout(() => void saveRef.current(), 500);
    }
    const before = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => {
      cancelled = true;
      alive.current = false;
      window.removeEventListener("beforeunload", before);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [onUpdate, attempt, active]);
  useEffect(()=>fileWorkspace.register(async()=>{
    if(isSaving.current)return '草稿正在保存，请稍后再切换。';
    if(!dirty.current)return;
    if(!await saveRef.current())return '草稿尚未保存，请先处理冲突或导出备份。';
  }),[]);
  useEffect(()=>{
    let cancelled=false,checking=false;
    const timer=setInterval(async()=>{
      if(checking||!loaded.current||dirty.current||isSaving.current)return;
      checking=true;const baseline=saved.current.hash;
      try{
        const response=await fetch('/api/scratch'),data=await response.json();
        if(!response.ok)throw new Error(data.error);
        if(cancelled||dirty.current||isSaving.current||saved.current.hash!==baseline||data.hash===baseline)return;
        const before=state.current?.doc.toString()||'';saved.current=data;
        if(view.current){const change=minimalReplacement({from:0,to:before.length,original:before,stale:false,file:'自由草稿.md'},data.text);view.current.dispatch({changes:{from:change.from,to:change.to,insert:change.text},userEvent:'input.disk-sync'});}
        else state.current=makeState(data.text,onUpdate,'Markdown 草稿编辑器');
        setCount(visibleCount(data.text));setStatus('草稿已保存');
      }catch(error){if(!cancelled)errorRef.current((error as Error).message);}finally{checking=false;}
    },2000);
    return()=>{cancelled=true;clearInterval(timer);};
  },[]);
  function exportDraft() {
    const url = URL.createObjectURL(
      new Blob([state.current?.doc.toString() || ""], {
        type: "text/markdown;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "自由草稿.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="scratch-pad" aria-label="独立草稿区">
      <div className="scratch-toolbar">
        <button
          className="scratch-file-link"
          title="在正文面板打开同一个 Markdown 文件"
          onClick={async () => {
            if (await saveRef.current()) onOpenFile?.();
          }}
        >
          自由草稿.md
        </button>
        <button
          className="icon-button"
          aria-label="保存草稿"
          title="保存草稿"
          disabled={!ready}
          onClick={() => void saveRef.current()}
        >
          <Save size={14} />
        </button>
        <button
          className="icon-button"
          aria-label="导出草稿"
          title="导出草稿"
          onClick={exportDraft}
        >
          <Download size={14} />
        </button>
      </div>
      <div className="scratch-meta">文档目录中的 Markdown 文件 · 自动保存</div>
      {ready ? (
        <Editor documentFile="自由草稿.md" annotationTool={annotationTool} searchActive={searchActive} onFind={onFind} onReady={onReady} onUpdate={onUpdate} onMarkSelection={onMarkSelection} onUnmarkSelection={onUnmarkSelection} onShowAnnotations={onShowAnnotations} onError={onError} onFocus={onEditorFocus}/>
      ) : (
        <div className="scratch-loading">
          <p>{status}</p>
          {status === "草稿载入失败" && (
            <button
              className="secondary-button"
              onClick={() => {
                setStatus("载入草稿…");
                setAttempt((value) => value + 1);
              }}
            >
              重新载入草稿
            </button>
          )}
        </div>
      )}
      <div className="scratch-status panel-status-footer" aria-label="草稿底栏">
        <span role="status">{status}</span>
        <span>{count} 字</span>
      </div>
    </section>
  );
}
