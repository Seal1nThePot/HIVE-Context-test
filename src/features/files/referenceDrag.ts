import type {WorkspaceReferenceSource} from '../chat/referenceSources';
export const REFERENCE_DRAG_TYPE='application/x-hive-reference';
export function referenceDragData(workspace:string,source:WorkspaceReferenceSource){return JSON.stringify({version:1,workspace,source});}
export function readReferenceDrag(raw:string,workspace:string):WorkspaceReferenceSource|null{
  try{const value=JSON.parse(raw),source=value.source;
    if(value.version!==1||value.workspace!==workspace||!source||!['file','folder'].includes(source.type)||typeof source.path!=='string'||!source.path||source.path.length>2000||source.path.includes('\\')||source.path.split('/').some((part:string)=>!part||part==='..'||part.startsWith('.'))||source.type==='file'&&!/\.md$/i.test(source.path))return null;
    return {path:source.path,type:source.type};
  }catch{return null;}
}
