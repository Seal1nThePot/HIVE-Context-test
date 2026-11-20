import {createContext,useContext,useState,type ReactNode} from 'react';
import type {ShortcutBindings} from './shortcuts';
import {readShortcutPreferences,writeShortcutPreferences,type MermaidZoomGesture} from './shortcutStorage';

const ShortcutContext=createContext<{
  bindings:ShortcutBindings;
  mermaidZoom:MermaidZoomGesture;
  save:(next:ShortcutBindings,mermaidZoom:MermaidZoomGesture)=>void;
}>({bindings:{},mermaidZoom:'ctrl-wheel',save:()=>{}});
export const useShortcutPreferences=()=>useContext(ShortcutContext);

export function ShortcutPreferencesProvider({children}:{children:ReactNode}){
  const [preferences,setPreferences]=useState(readShortcutPreferences);
  function save(bindings:ShortcutBindings,mermaidZoom:MermaidZoomGesture){
    writeShortcutPreferences(bindings,mermaidZoom);
    setPreferences({bindings,mermaidZoom});
  }
  return <ShortcutContext.Provider value={{...preferences,save}}>{children}</ShortcutContext.Provider>;
}
