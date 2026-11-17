import {createContext,useContext} from 'react';

/** Presentation visibility belongs to each panel/host, never to the global active editor. */
export const PanelActivityContext=createContext(true);
export const usePanelActivity=()=>useContext(PanelActivityContext);
export function panelIsVisible(open:boolean,mainVisible:boolean,native:boolean,nativeActive:boolean|null,hostHidden:boolean,documentHidden:boolean){
  return open&&!hostHidden&&!documentHidden&&(native?nativeActive!==false:mainVisible);
}
