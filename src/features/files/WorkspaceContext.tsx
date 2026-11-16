import {createContext, useContext, useMemo, useRef, type ReactNode} from 'react';

export type WorkspaceInfo={id:string;root:string;autoSave:boolean;revision:number};
type Guard=()=>Promise<string|void>;
type WorkspaceContextValue={info:WorkspaceInfo;request:typeof fetch;update:(patch:Partial<WorkspaceInfo>)=>Promise<void>;register:(guard:Guard)=>()=>void;flush:()=>Promise<void>};
const Context=createContext<WorkspaceContextValue|null>(null);
export function WorkspaceProvider({info,onChange,children}:{info:WorkspaceInfo;onChange:(info:WorkspaceInfo)=>void;children:ReactNode}) {
  const guards=useRef(new Set<Guard>());
  const request=useMemo<typeof fetch>(()=>(input,init)=>{
    const headers=new Headers(init?.headers);headers.set('X-Hive-Workspace',info.id);
    return fetch(input,{...init,headers});
  },[info.id]);
  const value:WorkspaceContextValue={info,request,register:guard=>{guards.current.add(guard);return()=>{guards.current.delete(guard);};},
    flush:async()=>{for(const guard of guards.current){const error=await guard();if(error)throw new Error(error);}},
    update:async patch=>{
      const response=await request('/api/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...patch,revision:info.revision})});
      const next=await response.json();if(!response.ok)throw new Error(next.error);onChange(next);
    }};
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useFileWorkspace(){const value=useContext(Context);if(!value)throw new Error('WorkspaceProvider is required');return value;}
