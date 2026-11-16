export type DiskFile = {
    path: string;
    text: string;
    hash: string;
    eol: "LF" | "CRLF";
    bom: boolean;
};
