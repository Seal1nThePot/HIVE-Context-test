import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileStore } from './files.mjs';
import { annotationStore } from './annotations.mjs';
import { writingNodeStore } from './writing-nodes.mjs';
import { outlineStore } from './outlines.mjs';
import { explorerStore } from './explorer.mjs';

const fail = (message, status = 400) => Object.assign(new Error(message), {status});
export async function workspaceStore(local, defaultRoot) {
  await fs.mkdir(local, {recursive:true});
  const configPath = path.join(local, 'workspace.json');
  const canonical = value => process.platform === 'win32' ? value.toLowerCase() : value;
  const idFor = root => createHash('sha256').update(canonical(root)).digest('hex').slice(0,24);
  let saved;
  try { saved = JSON.parse(await fs.readFile(configPath,'utf8')); }
  catch(error) { if(error.code !== 'ENOENT') throw error; }
  const initialRoot = path.resolve(defaultRoot);
  await fs.mkdir(initialRoot,{recursive:true});
  const defaultId = idFor(await fs.realpath(initialRoot));
  const contexts=new Map();
  async function prepare(input, migrate = false) {
    if(typeof input !== 'string' || !path.isAbsolute(input.trim()) || input.includes('\0')) throw fail('请填写现有文件夹的绝对路径。');
    let root;
    try {
      const stat = await fs.lstat(input.trim());
      if(!stat.isDirectory() || stat.isSymbolicLink()) throw fail('请选择普通文件夹，不使用目录联接或符号链接。');
      root = await fs.realpath(input.trim());
      await fs.access(root, fs.constants.R_OK | fs.constants.W_OK);
    } catch(error) { if(error.status) throw error; throw fail('无法访问这个文件夹，请检查路径和读写权限。'); }
    const id = idFor(root), state = id === defaultId ? local : path.join(local,'workspaces',id);
    if(contexts.has(id))return contexts.get(id);
    await fs.mkdir(state,{recursive:true});
    const files = fileStore(root, state);
    // Existing scratch files always win. Only migrate the original workspace's legacy scratch.
    if(migrate) {
      try { await files.read('自由草稿.md'); }
      catch(error) {
        if(error.code !== 'ENOENT') throw error;
        let old={text:'',eol:'LF',bom:false};
        try {old=await fileStore(local).read('scratch.md');} catch(error) {if(error.code!=='ENOENT')throw error;}
        await files.save({path:'自由草稿.md',text:old.text,eol:old.eol,bom:old.bom,baseline:null});
      }
    }
    const context={id,root,state,files,annotations:annotationStore(state),nodes:writingNodeStore(state),outlines:outlineStore(state)};
    context.explorer=explorerStore(context);
    contexts.set(id,context);return context;
  }
  let current = await prepare(saved?.root || initialRoot, !saved?.root || idFor(path.resolve(saved.root)) === defaultId);
  let autoSave = saved?.autoSave !== false, revision = Number.isInteger(saved?.revision) ? saved.revision : 0;
  let queue = Promise.resolve();
  const read = () => ({id:current.id,root:current.root,autoSave,revision});
  return {
    read,
    capture(id) {
      if(id && id !== current.id) throw fail('写作空间已在其他窗口切换。请刷新页面后继续；当前内容尚未覆盖磁盘。',409);
      return current;
    },
    update(input) {
      const task=queue.catch(()=>{}).then(async()=>{
        if(input.revision !== revision) throw fail('写作空间设置已变化，请刷新后重试。',409);
        if(input.autoSave !== undefined && typeof input.autoSave !== 'boolean') throw fail('自动保存设置无效。');
        const next=input.root === undefined ? current : await prepare(input.root);
        const nextAuto=input.autoSave ?? autoSave;
        const value={root:next.root,autoSave:nextAuto,revision:revision+1};
        const temp=configPath+'.'+randomUUID()+'.tmp';
        try {await fs.writeFile(temp,JSON.stringify(value,null,2),{flag:'wx'});await fs.rename(temp,configPath);}
        finally {await fs.rm(temp,{force:true}).catch(()=>{});}
        current=next;autoSave=nextAuto;revision=value.revision;
        return read();
      });
      queue=task;return task;
    }
  };
}
