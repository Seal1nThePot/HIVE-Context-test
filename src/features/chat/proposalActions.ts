import type { RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { Transaction } from '@codemirror/state';
import { canApply, headings, modeLabels, previewIntact, type Mode, type Proposal, type UndoEdit } from '../../shared/core';
import type { DiskFile } from '../../shared/fileTypes';
import { headingKey, type WritingNode } from '../outline/writingNodes';
import type { Message } from './chatTypes';
type ProposalContext = {
    view: RefObject<EditorView | null>;
    disk: RefObject<DiskFile | null>;
    proposal: RefObject<Proposal | null>;
    undo: RefObject<UndoEdit[]>;
    writingOutline: {
        nodes: WritingNode[];
        save: (nodes: WritingNode[]) => Promise<unknown>;
    };
    add: (role: Message['role'], content: string) => void;
    setError: (message: string) => void;
    inform: (message: string) => void;
    redraw: () => void;
    setMode: (mode: Mode) => void;
    openChat: () => void;
    promptRef: RefObject<HTMLTextAreaElement | null>;
};
export function createProposalActions({ view, disk, proposal, undo, writingOutline, add, setError, inform, redraw, setMode, openChat, promptRef }: ProposalContext) {
    // 建议已经在正文里了（未落盘）。✓ = 就留着这段，✗ = 把这段换回原文。
    function accept() {
        const a = proposal.current, v = view.current;
        if (!a || !v || !disk.current)
            return;
        if (!previewIntact(a, v.state.doc, disk.current.path)) {
            proposal.current = { ...a, stale: true };
            setError("这段文字已经被手改或位置变了，请先核对再决定保留还是撤掉。");
            redraw();
            return;
        }
        proposal.current = null;
        // 记录下来，用于「撤回 AI 修改」：range 现在装着 AI 的文字，撤回时换成原文。
        undo.current.push({
            from: a.from,
            to: a.to,
            original: a.text,
            before: a.original,
            stale: false,
            file: a.file,
        });
        if (a.mode === "outline" && a.creatingHeading && a.writingNodeId) {
            const nodes = writingOutline.nodes;
            const node = nodes.find((node) => node.id === a.writingNodeId);
            const currentHeadings = headings(v.state);
            const added = node
                ? currentHeadings.find((heading) => heading.from >= a.from &&
                    heading.from < a.from + a.text.length && heading.title === a.node)
                : undefined;
            if (node && added)
                void writingOutline.save(nodes.map((value) => value.id === node.id
                    ? { ...value, targetHeading: headingKey(currentHeadings, added) }
                    : value)).catch(() => { });
        }
        add("system", `已保留「${a.node}」的${modeLabels[a.mode]}：${a.text.trim()}。`);
        inform("已保留这段建议。");
        redraw();
    }
    function reject(adjust = false) {
        const a = proposal.current, v = view.current;
        if (!a)
            return;
        proposal.current = null;
        const removable = !!v && !!disk.current && previewIntact(a, v.state.doc, disk.current.path);
        if (removable)
            v!.dispatch({
                changes: { from: a.from, to: a.to, insert: a.original },
                selection: { anchor: a.from },
                userEvent: "input.ai.reject",
                annotations: Transaction.addToHistory.of(false),
            });
        add("system", removable
            ? `已${adjust ? "退回调整" : "撤掉"}「${a.node}」的${modeLabels[a.mode]}，正文回到原来的内容。`
            : `「${a.node}」那段预览已经被手改，没有再动它，请自行核对那段文字。`);
        if (adjust) {
            setMode(a.mode);
            openChat();
            promptRef.current?.focus();
        }
        redraw();
    }
    function undoAI() {
        const a = undo.current.at(-1), v = view.current;
        if (!a || !v || !disk.current)
            return;
        if (!canApply(a, v.state.doc.toString(), disk.current.path)) {
            setError("这处 AI 修改之后又被手改，已阻止自动撤回。请手动核对该位置。");
            return;
        }
        undo.current.pop();
        v.dispatch({
            changes: { from: a.from, to: a.to, insert: a.before },
            userEvent: "input.ai.undo",
        });
        add("system", "用户撤回了最近一次 AI 修改，范围外的手写内容保留。请以后续最新正文为准。");
        inform("已撤回最近一次 AI 修改。");
        redraw();
    }
    return { accept, reject, undoAI };
}
