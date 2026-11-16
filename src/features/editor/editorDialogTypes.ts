import type { InsertTarget } from './EditorInsertDialog';
export type Dialog = {
    kind: "new" | "folder" | "rename" | "saveAs" | "image" | "table" | "properties";
    title: string;
    value: string;
    target?: InsertTarget;
};
