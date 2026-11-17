import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileStore } from './files.mjs';
import { annotationStore } from './annotations.mjs';
import { writingNodeStore } from './writing-nodes.mjs';
import { outlineStore } from './outlines.mjs';
import { explorerStore } from './explorer.mjs';

const fail = (message, status = 400) => Object.assign(new Error(message), {status});
export async function workspaceStore(local, defaultRoot, {revealFile}={}) {
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
  async function resolveRoot(input) {
    if(typeof input !== 'string' || !path.isAbsolute(input.trim()) || input.includes('\0')) throw fail('请填写现有文件夹的绝对路径。');
    let root;
    try {
      const stat = await fs.lstat(input.trim());
      if(!stat.isDirectory() || stat.isSymbolicLink()) throw fail('请选择普通文件夹，不使用目录联接或符号链接。');
      root = await fs.realpath(input.trim());
      await fs.access(root, fs.constants.R_OK | fs.constants.W_OK);
    } catch(error) { if(error.status) throw error; throw fail('无法访问这个文件夹，请检查路径和读写权限。'); }
    return root;
  }
  async function prepare(input, migrate = false) {
    const root = await resolveRoot(input);
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
    context.explorer=explorerStore(context,undefined,{revealFile});
    files.suspend();
    contexts.set(id,context);return context;
  }
  let current = await prepare(saved?.root || initialRoot, !saved?.root || idFor(path.resolve(saved.root)) === defaultId);
  current.files.resume();
  let autoSave = saved?.autoSave !== false, revision = Number.isInteger(saved?.revision) ? saved.revision : 0;
  const validName = value => typeof value==='string' && value.trim().length<=80 && !/[\u0000-\u001f\u007f]/.test(value);
  const entryFor = (root,name) => ({id:idFor(root),root,...(validName(name)&&name.trim()?{name:name.trim()}:{})});
  let repositories = [];
  for(const entry of Array.isArray(saved?.repositories) ? saved.repositories : []) {
    if(!entry || typeof entry.root !== 'string' || !path.isAbsolute(entry.root) || entry.root.includes('\0')) continue;
    const normalized = entryFor(path.resolve(entry.root),entry.name);
    if(!repositories.some(item=>item.id===normalized.id)) repositories.push(normalized);
  }
  if(!repositories.some(item=>item.id===current.id)) repositories.push(entryFor(current.root));
  let queue = Promise.resolve();
  const read = () => ({id:current.id,root:current.root,autoSave,revision,repositories:repositories.map(item=>({...item}))});
  function enqueue(input,change) {
    const task=queue.catch(()=>{}).then(async()=>{
      if(input.revision !== revision) throw fail('写作空间设置已变化，请刷新后重试。',409);
      const next = await change();
      const value={root:next.current.root,autoSave:next.autoSave,revision:revision+1,repositories:next.repositories};
      const temp=configPath+'.'+randomUUID()+'.tmp';
      try {await fs.writeFile(temp,JSON.stringify(value,null,2),{flag:'wx'});await fs.rename(temp,configPath);}
      finally {await fs.rm(temp,{force:true}).catch(()=>{});}
      if (current !== next.current) {current.files.suspend(); next.current.files.resume();}
      current=next.current;autoSave=next.autoSave;repositories=next.repositories;revision=value.revision;
      return read();
    });
    queue=task;return task;
  }
  return {
    read,
    async close() {
      await queue.catch(()=>{});
      await Promise.all([...contexts.values()].map(context => context.files.close()));
    },
    capture(id) {
      if(id && id !== current.id) throw fail('写作空间已在其他窗口切换。请刷新页面后继续；当前内容尚未覆盖磁盘。',409);
      return current;
    },
    update(input) {
      return enqueue(input,async()=>{
        if(input.autoSave !== undefined && typeof input.autoSave !== 'boolean') throw fail('自动保存设置无效。');
        const next=input.root === undefined ? current : await prepare(input.root);
        return {current:next,autoSave:input.autoSave ?? autoSave,repositories:repositories.some(item=>item.id===next.id)?repositories:[...repositories,entryFor(next.root)]};
      });
    },
    manage(input) {
      return enqueue(input,async()=>{
        let next=repositories;
        if(input.action==='add') {
          const entry=entryFor(await resolveRoot(input.root));
          if(!next.some(item=>item.id===entry.id)) next=[...next,entry];
        } else if(input.action==='rename') {
          if(!validName(input.name)) throw fail('备注名称请使用 80 个字以内的单行文字。');
          if(!next.some(item=>item.id===input.id)) throw fail('这个仓库已不在列表中，请刷新后重试。',409);
          next=next.map(item=>{
            if(item.id!==input.id)return item;
            const {name:previousName,...entry}=item;
            return input.name.trim()?{...entry,name:input.name.trim()}:entry;
          });
        } else if(input.action==='remove') {
          if(input.id===current.id) throw fail('当前仓库正在使用，请先打开其他仓库再移出列表。');
          if(!next.some(item=>item.id===input.id)) throw fail('这个仓库已不在列表中，请刷新后重试。',409);
          next=next.filter(item=>item.id!==input.id);
        } else if(input.action==='reorder') {
          const order=input.order;
          if(!Array.isArray(order)||order.length!==next.length||new Set(order).size!==next.length||order.some(id=>!next.some(item=>item.id===id))) throw fail('仓库排列已变化，请刷新后重试。',409);
          const entries=new Map(next.map(item=>[item.id,item]));next=order.map(id=>entries.get(id));
        } else throw fail('仓库管理操作无效。');
        return {current,autoSave,repositories:next};
      });
    }
  };
}
