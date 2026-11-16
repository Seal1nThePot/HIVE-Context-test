import type { RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { canApply, headings, modeLabels, type Mode, type Proposal, type UndoEdit } from '../../shared/core';
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
    setPrompt: (text: string) => void;
    openChat: () => void;
    promptRef: RefObject<HTMLTextAreaElement | null>;
};
export function createProposalActions({ view, disk, proposal, undo, writingOutline, add, setError, inform, redraw, setMode, setPrompt, openChat, promptRef }: ProposalContext) {
    function accept() {
        const a = proposal.current, v = view.current;
        if (!a || !v || !disk.current)
            return;
        if (!canApply(a, v.state.doc.toString(), disk.current.path)) {
            proposal.current = { ...a, stale: true };
            setError("目标已被手改，或原位置已变化。请继续调整并重新生成。");
            redraw();
            return;
        }
        proposal.current = null;
        v.dispatch({
            changes: { from: a.from, to: a.to, insert: a.text },
            selection: { anchor: a.from + a.text.length },
            userEvent: "input.ai",
        });
        undo.current.push({
            from: a.from,
            to: a.from + a.text.length,
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
        add("system", `已采纳「${a.node}」的${modeLabels[a.mode]}建议：${a.text.trim()}。后续请以最新正文为准。`);
        inform("建议已写入正文，按 Ctrl+S 保存。");
        redraw();
    }
    function reject(adjust = false) {
        const a = proposal.current;
        if (!a)
            return;
        proposal.current = null;
        add("system", `已${adjust ? "退回调整" : "放弃"}「${a.node}」的建议：${a.text.trim()}。不要把未采纳内容当作当前正文。`);
        if (adjust) {
            setMode(a.mode);
            setPrompt("");
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
