import { createContext, useContext } from 'react';

/** The document that owns a panel, including a detached desktop window. */
export const PanelDocumentContext = createContext<Document | null>(null);
export function usePanelDocument(): Document {
  return useContext(PanelDocumentContext) || document;
}
