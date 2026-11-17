import {useSyncExternalStore} from 'react';
import {normalizeTheme,type BaseColor,type ThemePreferences} from './themePreferences';
import {applyOliveGrayHierarchyUpdate,bindThemeTemplate,flushThemePreferences,getThemeSnapshot} from './themeStore';

export type TemplateInfo={version:1;id:string;name:string;description:string;bases:BaseColor[];colorsFile:'colors.json';directory:string};
type TemplateRecord={template:TemplateInfo;directory:string;colors:ThemePreferences;revision:string|null;defaults?:ThemePreferences;defaultsRevision?:string|null};
type Catalog={directory:string;sourceDirectory?:string|null;templates:TemplateInfo[];warnings:string[]};
type Snapshot=Catalog&{status:'idle'|'loading'|'ready'|'saving'|'error';error:string};
let snapshot:Snapshot={directory:'',templates:[],warnings:[],status:'idle',error:''};
const listeners=new Set<()=>void>();
let boot:Promise<void>|undefined,saving:Promise<boolean>|undefined,polling=false,pollTimer:ReturnType<typeof setInterval>|undefined;
const publish=(patch:Partial<Snapshot>)=>{snapshot={...snapshot,...patch};listeners.forEach(fn=>fn());};
export const getTemplateFilesSnapshot=()=>snapshot;
export function subscribeTemplateFiles(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function useTemplateFiles(){return useSyncExternalStore(subscribeTemplateFiles,getTemplateFilesSnapshot,getTemplateFilesSnapshot);}
async function api<T>(url:string,body?:unknown):Promise<T>{
  const response=await fetch('/api/templates'+url,{...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'模板文件操作失败。');return data;
}
const route=(id:string)=>'/'+encodeURIComponent(id);
function bind(record:TemplateRecord,legacy=false){bindThemeTemplate(record.template,record.revision,record.defaultsRevision??record.revision,record.defaults??record.colors,legacy?record.colors:undefined);}
export async function refreshTemplateCatalog(){const catalog=await api<Catalog>('');if(JSON.stringify(catalog)!==JSON.stringify({directory:snapshot.directory,sourceDirectory:snapshot.sourceDirectory,templates:snapshot.templates,warnings:snapshot.warnings}))publish(catalog);return catalog;}
export async function pollTemplateFiles(){
  if(polling||saving||snapshot.status==='idle'||snapshot.status==='loading')return;
  polling=true;
  try{
    await refreshTemplateCatalog();const before=getThemeSnapshot(),record=await api<TemplateRecord>(route(before.templateId));
    const current=getThemeSnapshot();if(current.templateId!==before.templateId||current.preferences!==before.preferences||current.defaultScheme!==before.defaultScheme||saving)return;
    if(record.revision!==current.templateRevision||(record.defaultsRevision??record.revision)!==current.templateDefaultRevision||record.template.name!==current.templateBinding?.name||JSON.stringify(record.template.bases)!==JSON.stringify(current.templateBinding?.bases))bind(record);
    if(snapshot.status==='error')publish({status:'ready',error:''});
  }catch(error){publish({status:'error',error:'模板自动同步暂不可用：'+(error as Error).message});}finally{polling=false;}
}
function startPolling(){if(pollTimer!==undefined)return;pollTimer=setInterval(()=>{void pollTemplateFiles();},1500);if(typeof window!=='undefined')window.addEventListener('focus',()=>{void pollTemplateFiles();});}
export function initializeThemeFiles(){
  if(boot)return boot;publish({status:'loading',error:''});
  boot=(async()=>{
    const catalog=await refreshTemplateCatalog(),before=getThemeSnapshot();const id=catalog.templates.some(item=>item.id===before.templateId)?before.templateId:catalog.templates[0]?.id;
    if(!id)throw new Error('没有可用模板，请检查模板文件夹。');const record=await api<TemplateRecord>(route(id));
    if(getThemeSnapshot().preferences!==before.preferences)throw new Error('读取期间配色已变化，当前调整已保留。');
    bind(record,true);applyOliveGrayHierarchyUpdate();flushThemePreferences();publish({status:'ready',error:''});startPolling();
  })().catch(error=>{publish({status:'error',error:(error as Error).message});boot=undefined;});return boot;
}
// Personal edits, reset and shutdown never write template files.
export async function flushThemeFiles(){return flushThemePreferences();}
export async function saveCurrentTemplate():Promise<boolean>{
  if(saving)return saving;if(!boot)await initializeThemeFiles();const before=getThemeSnapshot();if(!before.templateBinding)return false;publish({status:'saving',error:''});
  saving=(async()=>{try{const record=await api<TemplateRecord>(route(before.templateId),{revision:before.templateRevision,colors:normalizeTheme(before.preferences)});if(getThemeSnapshot().templateId===before.templateId)bind(record);publish({status:'ready',error:''});return true;}catch(error){publish({status:'error',error:(error as Error).message});return false;}})();
  try{return await saving;}finally{saving=undefined;}
}
export async function loadTemplateFile(id:string){
  if(saving)await saving;if(!flushThemePreferences())throw new Error('用户配色尚未保存，请先处理本机保存提示。');
  const before=getThemeSnapshot(),record=await api<TemplateRecord>(route(id));if(getThemeSnapshot().preferences!==before.preferences||getThemeSnapshot().defaultScheme!==before.defaultScheme)throw new Error('读取期间配色已变化，当前调整已保留。');
  bind(record,true);applyOliveGrayHierarchyUpdate();flushThemePreferences();publish({status:'ready',error:''});startPolling();
}
export async function openCurrentTemplateFolder(){await initializeThemeFiles();return api<{ok:true;directory:string}>(route(getThemeSnapshot().templateId)+'/open',{});}
