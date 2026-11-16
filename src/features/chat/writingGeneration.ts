import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { EditorView } from '@codemirror/view';
import { makePrompt, minimalReplacement, parseSuggestion, visibleCount, type Anchor, type Heading, type Mode, type Proposal } from '../../shared/core';
import type { DiskFile } from '../../shared/fileTypes';
import type { EditorSession } from '../editor/editorSessionTypes';
import { annotationMessages, annotationSummary, type SubmittedAnnotation } from '../annotations/annotations';
import { targetForNode, type WritingNode } from '../outline/writingNodes';
import { activeModelLabel, type Config } from '../settings/modelConfig';
import { referenceOverrides, fitReferenceMessages, type ReferenceSource, type ResolvedReferences } from './referenceSources';
import type { Message } from './chatTypes';
import type { InputBasisRequest } from './InputBasisPanel';
import type { ReasoningEffort } from './modelReasoning';
import { generateDemoText, streamModelText } from './generationTransport';
export type GenerationOptions = {
    annotations: SubmittedAnnotation[];
    instruction: string;
};
export type GenerationContext = {
    document: {
        view: RefObject<EditorView | null>;
        disk: RefObject<DiskFile | null>;
        sessions: RefObject<Map<string, EditorSession>>;
        activeSession: RefObject<string>;
        file: string;
        outline: Heading[];
        currentHeading?: Heading;
        currentWritingNode?: WritingNode;
    };
    model: {
        config: Config;
        reasoningEffort: ReasoningEffort;
    };
    conversation: {
        mode: Mode;
        prompt: string;
        messages: Message[];
        setPrompt: Dispatch<SetStateAction<string>>;
        setLastRequest: (request: InputBasisRequest) => void;
        add: (role: Message['role'], content: string) => void;
    };
    lifecycle: {
        running: RefObject<boolean>;
        generation: RefObject<number>;
        controller: RefObject<AbortController | null>;
        requestAnchor: RefObject<Anchor | null>;
        proposal: RefObject<Proposal | null>;
    };
    references: {
        sources: ReferenceSource[];
    };
    writingOutline: {
        ready: boolean;
        busy: boolean;
        nodes: WritingNode[];
    };
    request: typeof fetch;
    annotationResponded: (submitted: SubmittedAnnotation[]) => void;
    ui: {
        setError: (message: string) => void;
        setBusy: (busy: boolean) => void;
        setStream: (text: string) => void;
        openPanel: (id: string) => void;
        inform: (message: string) => void;
        redraw: () => void;
    };
};
export function stopWritingGeneration(
    { generation, controller, requestAnchor, running }: GenerationContext['lifecycle'],
    { setBusy, setStream }: Pick<GenerationContext['ui'], 'setBusy' | 'setStream'>,
) {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    requestAnchor.current = null;
    running.current = false;
    setBusy(false);
    setStream('');
}
// Receives the existing live references; it does not create a second document/session store.
export async function generateWriting(context: GenerationContext, options?: GenerationOptions) {
    const { document: { view, disk, sessions, activeSession, file, outline, currentHeading, currentWritingNode }, model: { config, reasoningEffort }, conversation: { mode, prompt, messages, setPrompt, setLastRequest, add }, lifecycle: { running, generation, controller, requestAnchor, proposal }, references, writingOutline, request, annotationResponded, ui: { setError, setBusy, setStream, openPanel, inform, redraw } } = context;
    const uid = () => crypto.randomUUID();
    const submitted = options?.annotations;
    const requestMode = submitted ? "discuss" : mode;
    if (running.current ||
        !view.current ||
        (!submitted && (!disk.current || !prompt.trim())))
        return;
    if (proposal.current && requestMode !== "discuss") {
        setError("请先采纳或放弃当前建议；需要调整时点击「继续调整」。");
        return;
    }
    setError("");
    const v = view.current, document = v.state.doc.toString(), userPrompt = submitted
        ? options.instruction.trim() || "请逐条回应这些文本标注。"
        : prompt.trim();
    if (!submitted && document.length > 80000) {
        setError("原型本轮最多发送 8 万字符的文档，请先缩小文档。");
        return;
    }
    const s = v.state.selection.main;
    let from = s.head, to = s.head, target = "", node = "当前光标位置";
    let newNodeHeading = "";
    if (!submitted && requestMode === "edit") {
        if (s.empty) {
            setError("请先在正文中选中一个词、一句话或一小段，再提出修改要求。");
            return;
        }
        from = s.from;
        to = s.to;
        target = v.state.sliceDoc(from, to);
        node = currentHeading?.title || "当前选区";
    }
    else if (!submitted && requestMode === "outline") {
        if (!writingOutline.ready || writingOutline.busy) {
            setError("写作大纲正在载入，请稍后再试。");
            return;
        }
        if (!currentWritingNode) {
            setError("请先在大纲中选择这一轮要完成的写作节点。");
            return;
        }
        const heading = targetForNode(currentWritingNode, outline);
        const next = heading
            ? outline.find((h) => h.from > heading.from && h.level <= heading.level)
            : undefined;
        from = to = next?.from ?? document.length;
        node = currentWritingNode.title;
        target = heading
            ? document.slice(heading.from, from)
            : document.slice(Math.max(0, document.length - 2500));
        if (!heading)
            newNodeHeading =
                "#".repeat(currentWritingNode.level) + " " + currentWritingNode.title;
    }
    else {
        target = document.slice(Math.max(0, s.head - 2500), s.head);
        node = currentHeading?.title || "当前光标位置";
    }
    const requestLimit = config.continuationLimit;
    const anchor: Anchor = {
        from,
        to,
        original: document.slice(from, to),
        stale: false,
        file: disk.current?.path || "自由草稿",
    };
    requestAnchor.current = anchor;
    const history = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({
        role: m.role === "system" ? "user" : m.role,
        content: m.content,
    }));
    let requestMessages: {
        role: string;
        content: string;
    }[];
    try {
        requestMessages = submitted
            ? annotationMessages(submitted, userPrompt, history)
            : makePrompt(requestMode, document, target, node, userPrompt, history, {
                continuationLimit: requestLimit,
                nodeDescription: currentWritingNode?.description || "",
                writingOutline: writingOutline.nodes
                    .map((node) => "#".repeat(node.level) + " " + node.title)
                    .join("\n"),
            });
    }
    catch (error) {
        setError((error as Error).message);
        return;
    }
    const id = ++generation.current, abort = new AbortController(), requestSessionId = activeSession.current;
    controller.current = abort;
    running.current = true;
    setBusy(true);
    setStream("");
    let resolvedReferences: ResolvedReferences = { sources: [], files: [], warnings: [] };
    try {
        if (references.sources.length) {
            const selected = references.sources.map(source => ({ ...source })), buffers = [...sessions.current.values()].flatMap(session => { const state = session.view?.state || session.state; return session.disk && session.dirty && state ? [{ path: session.disk.path, text: state.doc.toString() }] : []; });
            const overrides = referenceOverrides(selected, buffers, file);
            const budget = Math.max(0, Math.min(60000, Math.floor(120000 - JSON.stringify(requestMessages).length - 6000)));
            const response = await request('/api/references/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sources: selected, currentFile: file, budget, overrides }), signal: abort.signal });
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.error || '参考资料读取失败。');
            if (abort.signal.aborted || generation.current !== id)
                throw new DOMException('已停止', 'AbortError');
            const fitted = fitReferenceMessages(requestMessages, data);
            requestMessages = fitted.messages;
            resolvedReferences = fitted.references;
        }
    }
    catch (error) {
        if (generation.current === id) {
            running.current = false;
            setBusy(false);
            controller.current = null;
            requestAnchor.current = null;
            if (!submitted)
                setPrompt(old => old || userPrompt);
            if ((error as Error).name !== 'AbortError')
                setError((error as Error).message);
        }
        else if (!running.current && activeSession.current === requestSessionId && !submitted)
            setPrompt(old => old || userPrompt);
        return;
    }
    const requestInfo = {
        messages: requestMessages,
        model: activeModelLabel(config), reasoningEffort: reasoningEffort, referenceDetails: { sources: resolvedReferences.sources, files: resolvedReferences.files.map(value => ({ path: value.path, source: value.source, characters: value.text.length, truncated: value.truncated })), warnings: resolvedReferences.warnings },
        demo: config.demo,
        mode: requestMode,
        node,
        scope: submitted
            ? `所选标注原文与备注＋当前会话 · ${submitted.length} 处`
            : requestMode === "edit"
                ? `选区 ${visibleCount(target)} 字`
                : requestMode === "discuss"
                    ? "仅讨论，不改正文"
                    : requestMode === "outline"
                        ? newNodeHeading
                            ? "文末创建大纲节点并插入正文"
                            : "指定章节末尾插入"
                        : "当前光标处插入",
        file: disk.current?.path || "自由草稿",
    };
    setLastRequest(requestInfo);
    add("user", submitted ? annotationSummary(submitted, userPrompt) : userPrompt);
    if (!submitted)
        setPrompt(old => old === userPrompt ? "" : old);
    if (resolvedReferences.warnings.length) {
        openPanel('basis');
        inform('部分参考资料有提示，可在依据的请求快照中查看。');
    }
    try {
        const raw = config.demo
            ? await generateDemoText({ requestMode, requestLimit, node, target, userPrompt, submitted, signal: abort.signal })
            : await streamModelText(request, { messages: requestMessages, selection: config.selection, reasoningEffort, signal: abort.signal }, text => { if (generation.current === id)
                setStream(text); });
        if (generation.current !== id || abort.signal.aborted)
            return;
        if (requestMode === "discuss") {
            add("assistant", raw);
            if (submitted)
                annotationResponded(submitted);
            return;
        }
        const result = parseSuggestion(raw, requestMode, requestLimit);
        const latest = requestAnchor.current;
        if (!latest || latest.file !== disk.current?.path)
            return;
        const now = v.state.doc.toString();
        let text = result.text;
        if (requestMode !== "edit") {
            const prefix = now.slice(0, latest.from), suffix = now.slice(latest.to);
            text =
                (prefix.endsWith("\n\n") || !prefix
                    ? ""
                    : prefix.endsWith("\n")
                        ? "\n"
                        : "\n\n") +
                    (newNodeHeading ? newNodeHeading + "\n\n" : "") +
                    text.trim() +
                    (suffix ? "\n\n" : "\n");
        }
        if (requestMode === "edit" && result.text === latest.original)
            throw new Error("模型没有提出实际文字变化。请补充更具体的修改要求后重试。");
        const changed = requestMode === "edit"
            ? minimalReplacement(latest, text)
            : { ...latest, text };
        proposal.current = {
            ...changed,
            id: uid(),
            reason: result.reason,
            mode: requestMode,
            count: visibleCount(changed.text),
            node,
            writingNodeId: requestMode === "outline" ? currentWritingNode?.id : undefined,
            creatingHeading: !!newNodeHeading,
        };
        openPanel(activeSession.current);
        add("assistant", `${config.demo ? "【交互演示】" : ""}已为「${node}」准备${requestMode === "edit" ? "一处局部修改" : requestMode === "outline" ? "节点正文" : "一段正文"}，共 ${visibleCount(changed.text)} 字。请在正文下方审阅，采纳后才会写入。`);
        redraw();
    }
    catch (e) {
        if (generation.current === id && (e as Error).name !== "AbortError") {
            setError((e as Error).message);
            if (!submitted)
                setPrompt(old => old || userPrompt);
            add("system", `本轮未完成：${(e as Error).message} 正文未改动。`);
        }
    }
    finally {
        if (generation.current === id) {
            running.current = false;
            setBusy(false);
            setStream("");
            controller.current = null;
            requestAnchor.current = null;
        }
    }
}
