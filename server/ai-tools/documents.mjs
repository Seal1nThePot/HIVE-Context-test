import path from 'node:path';
import {promises as fs} from 'node:fs';
import {z} from 'zod';
import {isDocumentPath} from '../file-kinds.mjs';
import {modelTool,toolError} from './model-tools.mjs';

const relativePath=z.string().trim().max(4096);
const createOptions=z.strictObject({parent:relativePath.optional().describe('上一级文件夹的仓库相对路径，仓库根目录可省略。'),
  name:z.string().trim().min(1).max(250).describe('文件或文件夹的名称，不含路径。')});
const list=modelTool('list_folder','查看已标注的文档仓库内指定文件夹的直接子项。',z.strictObject({
  folder:relativePath.optional().describe('文件夹的仓库相对路径，仓库根目录可省略。'),
}));
const createFile=modelTool('create_file','在已标注的文档仓库内新建 Markdown 文件。',createOptions);
const createFolder=modelTool('create_folder','在已标注的文档仓库内新建文件夹。',createOptions);
const trashFile=modelTool('trash_file','将已标注的文档仓库内指定文件移入回收站。',z.strictObject({
  path:relativePath.min(1).describe('指定文件的仓库相对路径。'),
}));
export const documentTools=[list,createFile,createFolder,trashFile];

function relative(value=''){
  const normalized=value.replace(/\\/g,'/');
  if(path.posix.isAbsolute(normalized)||path.win32.isAbsolute(normalized)||normalized.split('/').includes('..'))throw toolError('请提供标注仓库内的相对路径。');
  return normalized==='.'?'':normalized.replace(/\/+$/,'');
}

export async function runDocumentTool(workspace,{name,args}){
  if(name===list.name){
    const folder=relative(args.folder),dir=folder?await workspace.files.resolve(folder,true):workspace.root;
    if(folder&&!(await fs.lstat(dir)).isDirectory())throw toolError('指定路径不是文件夹。');
    const entries=await workspace.files.list(dir,folder?folder+'/':'');
    return {kind:'folder-list',folder,entries:entries.map(({name,path,type})=>({name,path,type}))};
  }
  if(name===trashFile.name){
    const file=relative(args.path),target=await workspace.files.resolve(file,true);
    if(!isDocumentPath(file)||!(await fs.lstat(target)).isFile())throw toolError('请选择文档仓库内的 Markdown 或图片文件。');
    return {kind:'document-trash',path:file};
  }
  const parent=relative(args.parent),type=name===createFile.name?'file':'folder';
  const plan=await workspace.explorer.prepareCreate({name:args.name,parent,type});
  return {kind:'document-create',parent,name:plan.name,type};
}
