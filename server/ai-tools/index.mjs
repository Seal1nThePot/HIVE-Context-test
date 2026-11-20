import {z} from 'zod';
import {chooseTool,toolError,toolInstruction,toolSelection,workspaceId} from './model-tools.mjs';
import {findInNote,findNoteTool} from './find-note.mjs';
import {repositoryContext,repositoryRequest,repositoryTools,runRepositoryTool} from './repositories.mjs';
import {documentTools,runDocumentTool} from './documents.mjs';
import {trashTools,runTrashTool} from './trash.mjs';
import {notePropertiesRequest,notePropertiesTool,noteOutlineRequest,noteOutlineTool,noteSnapshotTool,outlineContext,plannedOutline,validatedPropertyOperations} from './note-tools.mjs';

const findRequest=z.strictObject({
  instruction:toolInstruction,
  selection:toolSelection,
  target:z.strictObject({workspaceId,file:z.string().min(1),text:z.string()}),
});
const workspaceRequest=z.strictObject({instruction:toolInstruction,selection:toolSelection,target:z.strictObject({workspaceId})});

export function registerAiTools(app,{spaces,modelSettings}){
  async function useTool(req,res,body,tools,execute,context){
    if(res.destroyed)return;
    const route={...modelSettings.resolve(body.selection),sessionId:req.get('x-hive-model-session')},abort=new AbortController();
    const stop=()=>abort.abort();
    res.once('close',stop);
    try{
      const decision=await chooseTool(route,body.instruction,tools,abort.signal,context);
      if(res.destroyed)return;
      const workspace=spaces.capture(body.target.workspaceId);
      const result=await execute(decision,workspace);
      if(!res.destroyed)res.json(result);
    }catch(error){
      if(!res.destroyed)throw error;
    }finally{
      res.off('close',stop);
    }
  }
  app.post('/api/ai-tools/find-note',async(req,res)=>{
    const parsed=findRequest.safeParse(req.body);
    if(!parsed.success)throw toolError('查找请求缺少有效的标注笔记或查找要求。');
    const {target}=parsed.data;
    const workspace=spaces.capture(target.workspaceId);
    await workspace.files.resolve(target.file);
    await useTool(req,res,parsed.data,[findNoteTool],({args})=>({kind:'find-note',file:target.file,...findInNote(target.text,args)}));
  });
  app.post('/api/ai-tools/repositories',async(req,res)=>{
    const parsed=repositoryRequest.safeParse(req.body);
    if(!parsed.success)throw toolError('仓库请求缺少有效的仓库管理标注或操作要求。');
    const body=parsed.data;
    spaces.capture(body.target.workspaceId);
    await useTool(req,res,body,repositoryTools,decision=>runRepositoryTool(spaces,body,decision),repositoryContext(body.pendingName));
  });
  for(const [path,tools,execute] of [['documents',documentTools,runDocumentTool],['trash',trashTools,runTrashTool]]){
    app.post('/api/ai-tools/'+path,async(req,res)=>{
      const parsed=workspaceRequest.safeParse(req.body);
      if(!parsed.success)throw toolError('请求缺少有效的窗口标注或操作要求。');
      const body=parsed.data;
      spaces.capture(body.target.workspaceId);
      await useTool(req,res,body,tools,(decision,workspace)=>execute(workspace,decision));
    });
  }
  app.post('/api/ai-tools/note-properties',async(req,res)=>{
    const parsed=notePropertiesRequest.safeParse(req.body);
    if(!parsed.success)throw toolError('笔记属性请求缺少有效的笔记目标或操作要求。');
    const {target,fields}=parsed.data,workspace=spaces.capture(target.workspaceId);
    await workspace.files.resolve(target.file,true);
    await useTool(req,res,parsed.data,[notePropertiesTool,noteSnapshotTool],({name,args})=>name===noteSnapshotTool.name
      ?{kind:'create-note-snapshot',file:target.file}:{kind:'note-properties',file:target.file,operations:validatedPropertyOperations(args.operations)},
      ' 当前笔记属性的名称和类型如下：'+JSON.stringify(fields));
  });
  app.post('/api/ai-tools/note-outline',async(req,res)=>{
    const parsed=noteOutlineRequest.safeParse(req.body);
    if(!parsed.success)throw toolError('写作大纲请求无效，或正文超过 8 万字。');
    const {target,text}=parsed.data,workspace=spaces.capture(target.workspaceId);
    await workspace.files.resolve(target.file,true);
    const snapshot=await workspace.nodes.read(target.file);
    await useTool(req,res,parsed.data,[noteOutlineTool,noteSnapshotTool],({name,args})=>name===noteSnapshotTool.name
      ?{kind:'create-note-snapshot',file:target.file}:{kind:'note-outline',file:target.file,before:snapshot,nodes:plannedOutline(args,snapshot)},
      outlineContext(text,snapshot));
  });
}
