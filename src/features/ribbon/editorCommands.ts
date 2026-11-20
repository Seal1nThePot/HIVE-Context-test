import { undo as undoText, redo as redoText } from '@codemirror/commands';
import { inlineFormatting, paragraphAlignment, lineFormatting, insertStructure } from '../editor/formatting';
import type { InsertTarget } from '../editor/EditorInsertDialog';
import type { Dialog } from '../editor/editorDialogTypes';
import type { RibbonCommand } from './Ribbon';
type CommandContext = {
    target: InsertTarget;
    openSearch: () => void;
    onDialog: (dialog: Dialog) => void;
    onError: (message: string) => void;
};
export function runEditorCommand(command: RibbonCommand, { target, openSearch, onDialog, onError }: CommandContext) {
    const editor = target.editor;
    try {
        if (command === 'find') {
            openSearch();
            return;
        }
        if(editor.state.readOnly)
            throw new Error('当前编辑区只读。');
        if (command === 'image' || command === 'table' || command === 'properties') {
            if (command === 'image' && !target.file)
                throw new Error('请先保存当前文档，再插入图片。');
            onDialog({ kind: command, title: command === 'image' ? '插入图片' : command === 'table' ? '插入表格' : '笔记属性', value: '', target });
            return;
        }
        if (command === 'undo')
            undoText(editor);
        else if (command === 'redo')
            redoText(editor);
        else if (command === 'bold' || command === 'italic' || command === 'highlight' || command === 'underline' || command === 'strike' || command === 'inlineCode')
            editor.dispatch(inlineFormatting(editor.state, command));
        else if (command === 'codeBlock' || command === 'link' || command === 'rule' || command === 'details')
            editor.dispatch(insertStructure(editor.state, command));
        else if (command === 'left' || command === 'center' || command === 'right')
            editor.dispatch(paragraphAlignment(editor.state, command));
        else
            editor.dispatch(lineFormatting(editor.state, command));
        editor.focus();
    }
    catch (error) {
        onError((error as Error).message);
    }
}
