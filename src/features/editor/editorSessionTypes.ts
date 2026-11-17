import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { DiskFile } from '../../shared/fileTypes';
import type { Message } from '../chat/chatTypes';
import type { InputBasisRequest } from '../chat/InputBasisPanel';
import type { Proposal, UndoEdit } from '../../shared/core';
import type { DisplayMode } from './markdownDisplay';
export type EditorSession = {
    id: string;
    disk: DiskFile | null;
    state: EditorState | null;
    view: EditorView | null;
    dirty: boolean;
    contentVersion?:number;
    restoreScroll?: number;
    restoreScrollLeft?: number;
    typewriter?: boolean;
    displayMode?: DisplayMode;
    landing?: boolean;
    context?: {
        proposal: Proposal | null;
        undo: UndoEdit[];
        messages: Message[];
        prompt: string;
        writingNodeId: string | null;
        lastRequest: InputBasisRequest | null;
    };
};
