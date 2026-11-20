import path from 'node:path';
import {z} from 'zod';
import {modelTool,toolInstruction,toolSelection,workspaceId} from './model-tools.mjs';

const repositoryName=z.string().trim().min(1).max(80);
const list=modelTool('list_repositories','查阅 HIVE 仓库管理中的仓库清单。',z.strictObject({}));
const create=modelTool('create_repository','创建并登记新仓库。只有用户明确给出完整绝对目录时才填写 parent。parent 是新仓库的上一级目录。',z.strictObject({
  name:repositoryName.describe('新仓库名称，与创建的子文件夹同名。'),
  parent:z.string().trim().min(1).max(4096).optional().describe('用户明确给出的已存在上一级目录。缺少时省略。'),
}));
export const repositoryTools=[list,create];
export const repositoryRequest=z.strictObject({instruction:toolInstruction,selection:toolSelection,pendingName:repositoryName.optional(),
  target:z.strictObject({workspaceId,revision:z.number().int().nonnegative()}),
});

function explicitParent(instruction,parent){
  if(!parent||!path.isAbsolute(parent))return false;
  const normalize=value=>process.platform==='win32'?value.replace(/\\/g,'/').toLowerCase():value;
  const text=normalize(instruction),name=normalize(parent);
  const prefixes=['','在','到','于','：',':','（','(','“','「','"',"'"];
  const ends=/^[\s“”’」"'，,。；;、）)！!？?]/u;
  for(let index=text.indexOf(name);index!==-1;index=text.indexOf(name,index+name.length)){
    const before=text[index-1]??'',tail=text.slice(index+name.length);
    const after=tail.startsWith('/')&&(tail.length===1||ends.test(tail[1]))?tail.slice(1):tail;
    if((/\s/u.test(before)||prefixes.includes(before))&&(!after||ends.test(after)||/^(?:下|里)(?:创建|新建|建立|建一个)/u.test(after)))return true;
  }
  return false;
}

export function repositoryContext(pendingName){
  return pendingName?' 上一轮用户要求创建仓库 '+JSON.stringify(pendingName)+' 并缺少创建目录。本轮用户可能只提供绝对目录，请继续调用 create_repository。':'';
}

export async function runRepositoryTool(spaces,{target,instruction,pendingName},decision){
  const {workspaceId,revision}=target;
  if(decision.name===list.name){
    const {repositories}=await spaces.readRepositoryManifest(workspaceId);
    return {kind:'repository-list',repositories};
  }
  const {parent}=decision.args,name=pendingName??decision.args.name;
  if(!explicitParent(instruction,parent))return {kind:'repository-location-required',name,question:`你要在哪个目录创建「${name}」仓库？请提供已存在目录的绝对路径。`};
  return {kind:'repository-created',...await spaces.createRepository({workspaceId,revision,parent,name})};
}
