import {useRef, useState, type FormEvent} from 'react';
import {ArrowDown, ArrowRight, ArrowUp, Check, FolderOpen, FolderPlus, Pencil, Search, Server, X} from 'lucide-react';
import {repositoryLabel, useFileWorkspace} from './WorkspaceContext';
import './repositories.css';

export default function RepositoryPanel({onSwitch,onReturn}:{onSwitch:(root:string)=>Promise<void>;onReturn:()=>void}) {
  const space=useFileWorkspace();
  const [root,setRoot]=useState(''),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [editing,setEditing]=useState<{id:string;name:string}|null>(null);
  const pending=useRef(false);
  const repositories=space.info.repositories;
  const chooseDirectory=window.hiveDesktop?.chooseRepositoryDirectory;
  const shown=repositories.filter(item=>(repositoryLabel(item)+' '+item.root).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  async function run(action:()=>Promise<void>,message='') {
    if(pending.current)return false;
    pending.current=true;setBusy(true);setError('');setNotice('');
    try {await action();setNotice(message);return true;}
    catch(error) {setError((error as Error).message);return false;}
    finally {pending.current=false;setBusy(false);}
  }
  async function add(event:FormEvent) {
    event.preventDefault();
    let selected:string|null=null,exists=false;
    if(await run(async()=>{
      selected=chooseDirectory?await chooseDirectory():root.trim();
      if(!selected)return;
      setRoot(selected);
      exists=repositories.some(item=>item.root.replace(/[\\/]+$/,'').toLocaleLowerCase()===selected!.replace(/[\\/]+$/,'').toLocaleLowerCase());
      await space.manage({action:'add',root:selected});
    })&&selected)setNotice(exists?'这个仓库已在列表中。':'仓库已添加。');
  }
  function move(id:string,offset:number) {
    const order=repositories.map(item=>item.id),index=order.indexOf(id),target=index+offset;
    if(index<0||target<0||target>=order.length)return;
    [order[index],order[target]]=[order[target],order[index]];
    void run(()=>space.manage({action:'reorder',order}));
  }
  async function rename(event:FormEvent) {
    event.preventDefault();if(!editing)return;
    if(await run(()=>space.manage({action:'rename',id:editing.id,name:editing.name}),'备注名称已保存。'))setEditing(null);
  }
  return <div className="repository-page" aria-busy={busy}>
    <div className="repository-masthead">
    <header className="repository-heading"><span className="repository-heading-icon"><Server size={26}/></span><div><h1>仓库管理</h1><p>把不同的写作项目放在这里，随时打开。</p></div></header>
    <form className="repository-add" onSubmit={event=>void add(event)}>
      <div className="repository-add-fields"><input id="repository-root" aria-label="仓库文件夹路径" placeholder={chooseDirectory?'点击右侧添加按钮选择文件夹':'输入仓库文件夹的完整路径'} required={!chooseDirectory} readOnly={!!chooseDirectory} value={root} disabled={busy} onChange={event=>setRoot(event.target.value)}/><button type="submit" className="repository-primary" disabled={busy||!chooseDirectory&&!root.trim()}><FolderPlus size={15}/>添加仓库</button></div>
      <p>{chooseDirectory?'选择文件夹后自动添加，原文件保留在原目录。':'填写已有文件夹的完整路径，添加后从下方打开。'}</p>
    </form>
    </div>
    <div className="repository-toolbar"><h2>我的仓库 <span>{repositories.length}</span></h2><label className="repository-search"><Search size={15}/><input aria-label="搜索仓库" placeholder="搜索名称或路径…" value={query} onChange={event=>setQuery(event.target.value)}/></label></div>
    {error&&<p className="repository-feedback repository-error" role="alert">{error}</p>}
    {notice&&<p className="repository-feedback" role="status"><Check size={14}/>{notice}</p>}
    <div className="repository-grid" aria-label="仓库列表">{shown.map(item=>{
      const current=item.id===space.info.id,index=repositories.findIndex(value=>value.id===item.id),name=repositoryLabel(item);
      return <article className={'repository-card'+(current?' repository-current':'')} key={item.id} data-repository-id={item.id} aria-label={`仓库：${name}`}>
        <div className="repository-card-heading"><span className="repository-card-icon"><FolderOpen size={20}/></span><h3 title={name}>{name}</h3><button type="button" className="repository-rename" aria-label={`备注仓库名称：${name}`} title="备注名称" disabled={busy} onClick={()=>{setEditing({id:item.id,name:item.name||''});setError('');setNotice('');}}><Pencil size={15}/></button>{current&&<span className="repository-current-badge"><Check size={12}/>当前</span>}</div>
        {editing?.id===item.id&&<form className="repository-name-editor" onSubmit={event=>void rename(event)} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!busy)setEditing(null);}}}>
          <label htmlFor={`repository-name-${item.id}`}>备注名称</label><input id={`repository-name-${item.id}`} aria-label="仓库备注名称" value={editing.name} maxLength={80} placeholder="留空使用文件夹名" autoFocus disabled={busy} onChange={event=>setEditing({...editing,name:event.target.value})}/>
          <p>仅修改应用中的名称，文件夹名保持不变。</p><div><button type="submit" className="repository-primary" disabled={busy}><Check size={14}/>保存</button><button type="button" className="repository-secondary" disabled={busy} onClick={()=>setEditing(null)}>取消</button></div>
        </form>}
        <p className="repository-path" title={item.root}>{item.root}</p>
        <div className="repository-card-actions"><button type="button" className={current?'repository-secondary':'repository-primary'} disabled={busy} onClick={()=>{if(current)onReturn();else void run(()=>onSwitch(item.root));}}>{current?'返回写作':'打开仓库'}<ArrowRight size={14}/></button><div className="repository-order">
          <button type="button" aria-label={`上移仓库：${name}`} title="上移" disabled={busy||index===0||!!query.trim()} onClick={()=>move(item.id,-1)}><ArrowUp size={16}/></button>
          <button type="button" aria-label={`下移仓库：${name}`} title="下移" disabled={busy||index===repositories.length-1||!!query.trim()} onClick={()=>move(item.id,1)}><ArrowDown size={16}/></button>
          <button type="button" aria-label={`从列表移除仓库：${name}`} title={current?'请先打开其他仓库再移出列表':'从列表移除，文件保留'} disabled={busy||current} onClick={()=>void run(()=>space.manage({action:'remove',id:item.id}),'已从列表移除，文件仍保留在原文件夹。')}><X size={16}/></button>
        </div></div>
      </article>;
    })}</div>
    {!shown.length&&<div className="repository-empty"><Search size={25}/><p>没有找到匹配的仓库</p><button type="button" onClick={()=>setQuery('')}>清除搜索</button></div>}
  </div>;
}
