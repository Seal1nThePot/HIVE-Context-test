import {useFileWorkspace} from "../files/WorkspaceContext";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { EditorView } from "@codemirror/view";
import { headings } from "../../shared/core";
import { initialWritingNodes, type WritingNode } from "./writingNodes";
type Snapshot = {
  revision: number;
  initialized: boolean;
  nodes: WritingNode[];
};
async function sendRequest(
  fetch:typeof globalThis.fetch,
  file: string,
  nodes?: WritingNode[],
  revision?: number,
): Promise<Snapshot> {
  const response = await fetch(
    "/api/writing-outline" +
      (nodes === undefined ? "?file=" + encodeURIComponent(file) : ""),
    nodes === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file, nodes, revision }),
        },
  );
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(result.error), { status: response.status });
  return result;
}
export function useWritingNodes(
  file: string,
  editor: RefObject<EditorView | null>,
  onError: (message: string) => void,
) {
  const fileWorkspace=useFileWorkspace(),fetch=fileWorkspace.request;
  const request=(file:string,nodes?:WritingNode[],revision?:number)=>sendRequest(fetch,file,nodes,revision);
  const cache = useRef(new Map<string, Snapshot>()),
    active = useRef(file),
    errors = useRef(onError);
  active.current = file;
  errors.current = onError;
  const [snapshot, setSnapshot] = useState<Snapshot>({
      revision: 0,
      initialized: false,
      nodes: [],
    }),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [reload, setReload] = useState(0);
  useEffect(()=>fileWorkspace.register(async()=>busy?"大纲正在保存，请稍后再切换。":undefined),[busy]);
  function retry() {
    cache.current.delete(file);
    setReload((value) => value + 1);
  }
  useEffect(() => {
    let cancelled = false;
    if (!file) return;
    setReady(false);
    const cached = cache.current.get(file);
    if (cached) {
      setSnapshot(cached);
      setReady(true);
      return;
    }
    Promise.all([
      request(file),
      fetch("/api/outline?file=" + encodeURIComponent(file)).then((response) =>
        response.json(),
      ),
    ])
      .then(async ([value, legacy]) => {
        if (cancelled) return;
        let next = value;
        if (!value.initialized) {
          const nodes = initialWritingNodes(
            editor.current ? headings(editor.current.state) : [],
            legacy,
          );
          try {
            next = await request(file, nodes, 0);
          } catch (error) {
            if ((error as { status?: number }).status === 409)
              next = await request(file);
            else throw error;
          }
        }
        cache.current.set(file, next);
        if (!cancelled) {
          setSnapshot(next);
          setReady(true);
        }
      })
      .catch((error) => {
        if (!cancelled) errors.current(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [file, reload]);
  async function save(nodes: WritingNode[]) {
    if (!ready || busy) throw new Error("大纲正在载入或保存，请稍后再试。");
    const currentFile = file;
    setBusy(true);
    try {
      const next = await request(currentFile, nodes, snapshot.revision);
      cache.current.set(currentFile, next);
      if (active.current === currentFile) setSnapshot(next);
    } catch (error) {
      errors.current((error as Error).message);
      if ((error as { status?: number }).status === 409) retry();
      throw error;
    } finally {
      setBusy(false);
    }
  }
  return { nodes: snapshot.nodes, save, busy, ready, retry };
}
