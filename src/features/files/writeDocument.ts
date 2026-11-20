import type { ApiClient } from '../../shared/api';
import type { DiskFile } from '../../shared/fileTypes';

type DocumentWrite = Pick<DiskFile, 'path' | 'text' | 'eol' | 'bom'> & {
  baseline: string | null;
};

export type DocumentWriteResult = {
  path: string;
  hash: string;
  warning?: string;
};

export function writeDocument(api: ApiClient, document: DocumentWrite) {
  return api<DocumentWriteResult>('/file', document);
}
