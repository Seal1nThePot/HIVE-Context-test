import {useEffect,useRef,useState,type Dispatch,type SetStateAction} from 'react';
import {createPortal} from 'react-dom';
import {ArrowDownWideNarrow,ChevronDown,ChevronRight,FileText,Folder,FolderPlus,Plus,Search,Sparkles} from 'lucide-react';
import {flattenEntries,mapEntryPath,parentPath,readOrder,remapOrder,reorderEntry,sortEntries,sortDirection,menuActions,type Entry,type ExplorerOrder,type SortMode,type SortDirection} from './explorerState';
import './file-explorer.css';
import type {ReferenceSource} from '../chat/referenceSources';
import {useFileWorkspace} from './WorkspaceContext';

export type FileAction={action:string;path?:string;parent?:string;name?:string;type?:'file'|'folder';id?:string};
export type FileResult={path:string;from?:string;type:'file'|'folder';id?:string;deletedAt?:string};
type Props={entries:Entry[];workspaceId:string;root:string;file:string;dirty:boolean;filter:string;setFilter:(value:string)=>void;collapsed:Set<string>;setCollapsed:Dispatch<SetStateAction<Set<string>>>;
  onReferenceDrop?:(source:ReferenceSource)=>void;onOpen:(path:string,newTab?:boolean)=>Promise<void>;onAction:(action:FileAction)=>Promise<FileResult>;onAI:(path:string)=>void;renameRequest?:{path:string;key:string}};
type Menu={x:number;y:number;entry?:Entry;sort?:boolean};
type Drop={path:string;where:'before'|'after'|'inside'};
export default function FileExplorer({entries,workspaceId,root,file,dirty,filter,setFilter,collapsed,setCollapsed,onOpen,onAction,onAI,renameRequest,onReferenceDrop}:Props){
  const storage='hive.explorer.v1:'+workspaceId;
  const space=useFileWorkspace();
  const [searchResult,setSearchResult]=useState<{scope:string;query:string;matches:{path:string;line:number|null;excerpt:string}[];truncated:boolean}|null>(null),[searching,setSearching]=useState(false);

  const [order,setOrder]=useState<ExplorerOrder>(()=>{try{return readOrder(localStorage.getItem(storage));}catch{return readOrder(null);}});
  const [selected,setSelected]=useState(''),[scope,setScope]=useState(''),[menu,setMenu]=useState<Menu|null>(null),[rename,setRename]=useState<{path:string;value:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [move,setMove]=useState<Entry|null>(null),[moveParent,setMoveParent]=useState(''),[deleting,setDeleting]=useState<Entry|null>(null),[drop,setDrop]=useState<Drop|null>(null);
  useEffect(()=>{
    if(!scope||!filter.trim()){setSearchResult(null);setSearching(false);return;}
    const controller=new AbortController();let alive=true;setSearching(true);
    const timer=setTimeout(()=>{void space.request('/api/explorer/search?folder='+encodeURIComponent(scope)+'&query='+encodeURIComponent(filter),{signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);if(alive)setSearchResult({...data,scope,query:filter});}).catch(error=>{if(alive&&error.name!=='AbortError')setError(error.message);}).finally(()=>{if(alive)setSearching(false);});},250);
    return()=>{alive=false;clearTimeout(timer);controller.abort();};
  },[scope,filter,space.request,entries]);
  const container=useRef<HTMLDivElement>(null),menuRef=useRef<HTMLDivElement>(null),search=useRef<HTMLInputElement>(null),drag=useRef<string|null>(null),renaming=useRef(false),cancelRename=useRef(false);
  const skipClick=useRef(false),dragCleanup=useRef<(()=>void)|null>(null);
  useEffect(()=>()=>dragCleanup.current?.(),[]);
  const all=flattenEntries(entries),focused=all.find(item=>item.path===selected);
  function store(next:ExplorerOrder){setOrder(next);try{localStorage.setItem(storage,JSON.stringify(next));}catch{setError('排序已生效，但无法保存在此浏览器中。');}}
  function expand(path:string){setCollapsed(old=>new Set([...old].filter(value=>path!==value&&!path.startsWith(value+'/'))));}
  async function run<T>(fn:()=>Promise<T>):Promise<T|undefined>{if(busy)return;setBusy(true);setError('');try{return await fn();}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  function beginRename(entry:Entry){cancelRename.current=false;setRename({path:entry.path,value:entry.name});setSelected(entry.path);expand(entry.path);}
  useEffect(()=>{if(!renameRequest)return;setFilter('');setScope('');beginRename({path:renameRequest.path,name:renameRequest.path.split('/').at(-1)!,type:'file'});},[renameRequest?.key]);
  async function commitRename(){if(!rename||renaming.current||cancelRename.current)return;const current=rename;renaming.current=true;
    if(!current.value.trim()){setError('名称不能为空。');renaming.current=false;return;}
    if(current.value===all.find(item=>item.path===current.path)?.name){setRename(null);renaming.current=false;return;}
    const result=await run(()=>onAction({action:'rename',path:current.path,name:current.value.trim()}));
    if(result){store(remapOrder(order,current.path,result.path));setSelected(result.path);setRename(null);if(scope) setScope(mapEntryPath(scope,current.path,result.path));requestAnimationFrame(()=>container.current?.querySelector<HTMLElement>('[data-selected="true"]')?.focus());}
    renaming.current=false;
  }
  async function create(type:'file'|'folder',parent=focused?.type==='folder'?focused.path:focused?parentPath(focused.path):scope){
    const result=await run(()=>onAction({action:'create',parent,type}));if(!result)return;
    expand(result.path);setFilter('');setScope('');
    if(type==='file')await run(()=>onOpen(result.path,true));
    beginRename({name:result.path.split('/').at(-1)!,path:result.path,type});
  }
  async function operation(action:string,entry:Entry){setMenu(null);
    if(action==='rename'){beginRename(entry);return;}
    if(action==='move'){setMove(entry);setMoveParent(parentPath(entry.path));return;}
    if(action==='trash'){setDeleting(entry);return;}
    if(action==='search'){setScope(entry.path);setFilter('');expand(entry.path);search.current?.focus();return;}
    if(action==='ai'){onAI(entry.path);return;}
    if(action==='copy'){await run(()=>navigator.clipboard.writeText(root.replace(/[\\/]$/,'')+'\\'+entry.path.replace(/\//g,'\\')));return;}
    if(action==='tab'){await run(()=>onOpen(entry.path,true));return;}
    const result=await run(()=>onAction({action,path:entry.path}));if(result&&action==='duplicate')beginRename({name:result.path.split('/').at(-1)!,path:result.path,type:result.type});
  }
  useEffect(()=>{
    if(!menu)return;const box=menuRef.current;if(box){const rect=box.getBoundingClientRect();box.style.left=Math.max(6,Math.min(menu.x,window.innerWidth-rect.width-6))+'px';box.style.top=Math.max(6,Math.min(menu.y,window.innerHeight-rect.height-6))+'px';box.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();}
    const outside=(event:PointerEvent)=>{if(!menuRef.current?.contains(event.target as Node))setMenu(null);};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
  },[menu]);
  function closeMenu(){setMenu(null);requestAnimationFrame(()=>container.current?.querySelector<HTMLElement>('[data-selected="true"]')?.focus());}
  const currentResults=searchResult?.scope===scope&&searchResult.query===filter?searchResult:null;
  function matches(entry:Entry):boolean{return (currentResults?currentResults.matches.some(item=>item.path===entry.path)||!!entry.children?.some(matches):entry.path.toLowerCase().includes(filter.toLowerCase())||!!entry.children?.some(matches))&&(!scope||entry.path===scope||entry.path.startsWith(scope+'/')||scope.startsWith(entry.path+'/'));}
  async function dropAt(target:Drop){const source=drag.current;drag.current=null;setDrop(null);if(!source||source===target.path)return;
    const destination=target.where==='inside'?target.path:parentPath(target.path),name=source.split('/').at(-1)!,nextPath=[destination,name].filter(Boolean).join('/');
    if(destination===source||destination.startsWith(source+'/')){setError('不能把文件夹拖入自身。');return;}
    if(parentPath(source)!==destination){const result=await run(()=>onAction({action:'move',path:source,parent:destination}));if(!result)return;expand(result.path);}
    const siblings=sortEntries(destination?all.find(item=>item.path===destination)?.children||[]:entries,order,destination).map(item=>item.path);
    let before=target.where==='before'?target.path:target.where==='after'?siblings[siblings.indexOf(target.path)+1]:undefined;
    if(before===source)before=siblings[siblings.indexOf(source)+1];
    store(reorderEntry(remapOrder(order,source,nextPath),siblings.map(value=>value===source?nextPath:value),nextPath,before));setSelected(nextPath);
  }
  function beginDrag(path:string,event:React.PointerEvent<HTMLElement>){
    if(event.button!==0||busy||rename||(event.target as HTMLElement).closest('input,button'))return;
    dragCleanup.current?.();const start={x:event.clientX,y:event.clientY},pointerId=event.pointerId;
    let started=false,current:Drop|null=null,referenceTarget:HTMLElement|null=null;
    const clearReference=()=>{referenceTarget?.classList.remove('reference-drag-active');referenceTarget=null;};
    const clean=()=>{window.removeEventListener('pointermove',movePointer);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',cancel);window.removeEventListener('keydown',key,true);window.removeEventListener('blur',cancel);clearReference();dragCleanup.current=null;};
    const movePointer=(next:PointerEvent)=>{
      if(next.pointerId!==pointerId)return;
      if(!started&&Math.hypot(next.clientX-start.x,next.clientY-start.y)<5)return;
      started=true;drag.current=path;next.preventDefault();
      const hit=document.elementFromPoint(next.clientX,next.clientY),candidate=hit?.closest<HTMLElement>('.reference-drop-target'),row=hit?.closest<HTMLElement>('.explorer-row'),tree=container.current?.querySelector('.explorer-tree');
      clearReference();if(onReferenceDrop&&candidate?.dataset.referenceWorkspace===workspaceId){referenceTarget=candidate;referenceTarget.classList.add('reference-drag-active');current=null;setDrop(null);return;}
      if(row&&container.current?.contains(row)){
        const rect=row.getBoundingClientRect(),ratio=(next.clientY-rect.y)/rect.height,targetPath=row.dataset.path!,folder=all.find(item=>item.path===targetPath)?.type==='folder';
        current={path:targetPath,where:folder&&ratio>.25&&ratio<.75?'inside':ratio<.5?'before':'after'};
      }else current=tree?.contains(hit)?{path:'',where:'inside'}:null;
      if(tree){const rect=tree.getBoundingClientRect();if(next.clientY<rect.y+20)tree.scrollTop-=12;else if(next.clientY>rect.bottom-20)tree.scrollTop+=12;}
      setDrop(current);
    };
    const cancel=()=>{clean();drag.current=null;setDrop(null);};
    const key=(next:KeyboardEvent)=>{if(next.key==='Escape'){next.preventDefault();next.stopPropagation();cancel();}};
    const finish=(next:PointerEvent)=>{if(next.pointerId!==pointerId)return;
      const hit=document.elementFromPoint(next.clientX,next.clientY),reference=hit?.closest<HTMLElement>('.reference-drop-target'),row=hit?.closest<HTMLElement>('.explorer-row'),tree=container.current?.querySelector('.explorer-tree');
      let finalDrop:Drop|null=null;
      if(!reference&&row&&container.current?.contains(row)){const rect=row.getBoundingClientRect(),ratio=(next.clientY-rect.y)/rect.height,targetPath=row.dataset.path!,folder=all.find(item=>item.path===targetPath)?.type==='folder';finalDrop={path:targetPath,where:folder&&ratio>.25&&ratio<.75?'inside':ratio<.5?'before':'after'};}
      else if(!reference&&tree?.contains(hit))finalDrop={path:'',where:'inside'};
      clean();if(started){skipClick.current=true;setTimeout(()=>{skipClick.current=false;},0);if(reference){drag.current=null;setDrop(null);if(onReferenceDrop&&reference.dataset.referenceWorkspace===workspaceId){const entry=all.find(item=>item.path===path);if(entry)onReferenceDrop({path:entry.path,type:entry.type});}}else if(finalDrop)void dropAt(finalDrop);else{drag.current=null;setDrop(null);}}};
    window.addEventListener('pointermove',movePointer,{passive:false});window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',cancel);window.addEventListener('keydown',key,true);window.addEventListener('blur',cancel);dragCleanup.current=cancel;
  }
  function row(items:Entry[],depth=0){return sortEntries(items,order,depth?parentPath(items[0]?.path||''):'').filter(matches).map(entry=>{
    const hit=currentResults?.matches.find(item=>item.path===entry.path);
    const folder=entry.type==='folder',open=!collapsed.has(entry.path)||!!filter||!!scope,editing=rename?.path===entry.path;
    return <div key={entry.path} role="none"><div className={'explorer-row '+(file===entry.path?'active-file ':'')+(drop?.path===entry.path?'drop-'+drop.where:'')} role="treeitem" aria-level={depth+1} aria-selected={selected===entry.path} aria-expanded={folder?open:undefined} data-path={entry.path} data-selected={selected===entry.path} title={entry.path+(hit?.line?'\n第 '+hit.line+' 行：'+hit.excerpt:'')} tabIndex={selected===entry.path||!selected&&all[0]?.path===entry.path?0:-1} onPointerDown={event=>beginDrag(entry.path,event)}
      style={{paddingLeft:8+depth*16}} onFocus={()=>setSelected(entry.path)}
      onClick={()=>{if(skipClick.current)return;setSelected(entry.path);if(editing)return;if(folder)setCollapsed(old=>{const next=new Set(old);if(next.has(entry.path))next.delete(entry.path);else next.add(entry.path);return next;});else void run(()=>onOpen(entry.path));}}
      onContextMenu={event=>{event.preventDefault();event.stopPropagation();setSelected(entry.path);setMenu({x:event.clientX,y:event.clientY,entry});}}
      onKeyDown={event=>{if(editing)return;if(event.key==='Enter'&&!event.ctrlKey){event.preventDefault();event.currentTarget.click();}if(folder&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();setCollapsed(old=>{const next=new Set(old);if(event.key==='ArrowLeft')next.add(entry.path);else next.delete(entry.path);return next;});}if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const nodes=Array.from(container.current?.querySelectorAll<HTMLElement>('[role="treeitem"]')||[]),index=nodes.indexOf(event.currentTarget),next=event.key==='Home'?0:event.key==='End'?nodes.length-1:Math.max(0,Math.min(nodes.length-1,index+(event.key==='ArrowDown'?1:-1)));nodes[next]?.focus();}if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();setMenu({entry,x:rect.x+30,y:rect.bottom});}}}>
      {folder?(open?<ChevronDown size={12}/>:<ChevronRight size={12}/>):<span className="explorer-spacer"/>}{folder?<Folder size={15}/>:<FileText size={15}/>}
      {editing?<input aria-label="文件名称" autoFocus value={rename.value} disabled={busy} onClick={event=>event.stopPropagation()} onFocus={event=>{const end=entry.type==='file'?event.currentTarget.value.replace(/\.md$/i,'').length:event.currentTarget.value.length;event.currentTarget.setSelectionRange(0,end);}} onChange={event=>setRename({...rename,value:event.target.value})} onBlur={()=>void commitRename()} onKeyDown={event=>{event.stopPropagation();if(event.key==='Enter'){event.preventDefault();void commitRename();}if(event.key==='Escape'){cancelRename.current=true;setRename(null);}}}/>:<span className="explorer-name">{entry.name.replace(/\.md$/i,'')}</span>}
      {hit?.line&&<small className="explorer-hit-line">{hit.line} 行</small>}
      {!folder&&file===entry.path&&<i className={dirty?'dirty-dot':'file-dot'}/>}
    </div>{folder&&open&&<div role="group">{row(entry.children||[],depth+1)}</div>}</div>;
  });}
  const sortOptions:{label:string;mode:SortMode;direction?:SortDirection}[]=[
    {label:'文件名 A → Z',mode:'name',direction:'asc'},{label:'文件名 Z → A',mode:'name',direction:'desc'},
    {label:'编辑时间：新 → 旧',mode:'modified',direction:'desc'},{label:'编辑时间：旧 → 新',mode:'modified',direction:'asc'},
    {label:'创建时间：新 → 旧',mode:'created',direction:'desc'},{label:'创建时间：旧 → 新',mode:'created',direction:'asc'},
    {label:'自定义排序',mode:'manual'},
  ];
  const actions:Record<string,{label:string;key?:string;run:()=>void}>= {
    tab:{label:'在新标签页中打开',key:'Ctrl+Enter',run:()=>void operation('tab',menu!.entry!)},
    createFile:{label:'新建笔记',key:'Ctrl+N',run:()=>{setMenu(null);void create('file',menu?.entry?.type==='folder'?menu.entry.path:'');}},
    createFolder:{label:'新建文件夹',key:'Ctrl+Shift+N',run:()=>{setMenu(null);void create('folder',menu?.entry?.type==='folder'?menu.entry.path:parentPath(menu?.entry?.path||''));}},
    duplicate:{label:'创建副本',run:()=>void operation('duplicate',menu!.entry!)},
    move:{label:'移动到…',run:()=>void operation('move',menu!.entry!)},
    search:{label:'在文件夹中查找',key:'Ctrl+Shift+F',run:()=>void operation('search',menu!.entry!)},
    copy:{label:'复制路径',key:'Ctrl+Shift+C',run:()=>void operation('copy',menu!.entry!)},
    reveal:{label:'在系统资源管理器中显示',run:()=>void operation('reveal',menu!.entry!)},
    ai:{label:'添加到 AI',run:()=>void operation('ai',menu!.entry!)},
    rename:{label:'重命名',key:'F2',run:()=>void operation('rename',menu!.entry!)},
    trash:{label:'删除到回收站',key:'Delete',run:()=>void operation('trash',menu!.entry!)},
  };
  const actionOrder=menuActions(menu?.entry?.type);if(actionOrder.includes('ai')){actionOrder.splice(actionOrder.indexOf('ai'),1);const tab=actionOrder.indexOf('tab');actionOrder.splice(tab<0?0:tab+1,0,'ai');}
  const menuItems:{label:string;key?:string;run:()=>void;emphasis?:boolean}[]=menu?.sort?sortOptions.map(option=>({label:(order.mode===option.mode&&(!option.direction||sortDirection(order)===option.direction)?'✓ ':'')+option.label,run:()=>{store({...order,mode:option.mode,...(option.direction?{direction:option.direction}:{})});setMenu(null);}})):actionOrder.map(action=>({...actions[action],emphasis:action==='ai'}));
  return <div ref={container} className="file-explorer" aria-busy={busy} onKeyDown={event=>{
    if((event.target as HTMLElement).closest('input,textarea,[role="menu"]'))return;
    const ctrl=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
    if(ctrl&&key==='n'){event.preventDefault();void create(event.shiftKey?'folder':'file');}
    else if(focused){if(event.key==='F2'){event.preventDefault();beginRename(focused);}if(event.key==='Delete'){event.preventDefault();setDeleting(focused);}if(ctrl&&event.key==='Enter'&&focused.type==='file'){event.preventDefault();void operation('tab',focused);}if(ctrl&&event.shiftKey&&key==='c'){event.preventDefault();void operation('copy',focused);}if(ctrl&&event.shiftKey&&key==='f'&&focused.type==='folder'){event.preventDefault();void operation('search',focused);}}
  }} onContextMenu={event=>{event.preventDefault();setMenu({x:event.clientX,y:event.clientY});}}>
    <div className="explorer-search"><Search size={13}/><input ref={search} aria-label="筛选文件" placeholder={scope?'在文件夹中查找…':'查找文件…'} value={filter} onChange={event=>setFilter(event.target.value)}/></div>
    <div className="explorer-tools"><span title={scope}>{scope?scope.split('/').at(-1):'全部文档'}</span>{scope&&<button type="button" onClick={()=>{setScope('');setFilter('');}}>全部</button>}<div>
      <button type="button" aria-label="文件排序" title="排序" aria-haspopup="menu" onClick={event=>{const rect=event.currentTarget.getBoundingClientRect();setMenu({x:rect.x,y:rect.bottom,sort:true});}}><ArrowDownWideNarrow size={14}/></button>
      <button type="button" aria-label="新建文件夹" title="新建文件夹（Ctrl+Shift+N）" disabled={busy} onClick={()=>void create('folder')}><FolderPlus size={14}/></button>
      <button type="button" aria-label="新建文档" title="新建文档（Ctrl+N）" disabled={busy} onClick={()=>void create('file')}><Plus size={15}/></button>
    </div></div>
    {scope&&filter&&<small className="explorer-search-status" role="status">{searching?'正在查找文件名与正文…':currentResults?`找到 ${currentResults.matches.length} 份文档${currentResults.truncated?'，仅显示前 200 份':''}`:'查找文件名与正文'}</small>}
    {error&&<p className="explorer-error" role="alert">{error}<button type="button" aria-label="关闭文件操作提示" onClick={()=>setError('')}>×</button></p>}
    <div role="tree" aria-label="文件和文件夹" className={'explorer-tree '+(drop?.path===''?'drop-inside':'')}>{row(entries)}{!all.some(matches)&&<p className="empty-note">{filter?'没有匹配的文件。':'从一份新文档开始。'}</p>}<div className="explorer-root-drop">拖到空白处移至根目录</div></div>
    {menu&&createPortal(<div ref={menuRef} role="menu" aria-label={menu.sort?'文件排序':'文件操作'} className="explorer-menu" style={{left:menu.x,top:menu.y}} onKeyDown={event=>{const nodes=Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]),index=nodes.indexOf(document.activeElement as HTMLButtonElement);if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();nodes[event.key==='Home'?0:event.key==='End'?nodes.length-1:(index+(event.key==='ArrowDown'?1:-1)+nodes.length)%nodes.length]?.focus();}if(event.key==='Escape'){event.preventDefault();closeMenu();}if(event.key==='Tab')closeMenu();}}>{menuItems.map(item=><button key={item.label} role="menuitem" type="button" className={item.emphasis?'explorer-menu-ai':undefined} disabled={busy} onClick={()=>void item.run()}><span>{item.emphasis&&<Sparkles size={14} aria-hidden="true"/>}{item.label}</span>{item.key&&<kbd>{item.key}</kbd>}</button>)}</div>,document.body)}
    {(move||deleting)&&createPortal(<dialog className="explorer-dialog" aria-label={move?'移动到文件夹':'删除到回收站'} ref={element=>{if(element&&!element.open)element.showModal();}} onCancel={event=>{event.preventDefault();if(!busy){setMove(null);setDeleting(null);}}}>
      <h2>{move?'移动到文件夹':'删除到回收站'}</h2>
      {error&&<p role="alert">{error}</p>}
      {move&&<><p>{move.name}</p><label>目标文件夹<select aria-label="目标文件夹" value={moveParent} onChange={event=>setMoveParent(event.target.value)}><option value="">根目录</option>{all.filter(item=>item.type==='folder'&&item.path!==move.path&&!item.path.startsWith(move.path+'/')).map(item=><option key={item.path} value={item.path}>{item.path}</option>)}</select></label><button type="button" disabled={busy} onClick={async()=>{const result=await run(()=>onAction({action:'move',path:move.path,parent:moveParent}));if(result){store(remapOrder(order,move.path,result.path));expand(result.path);setSelected(result.path);setMove(null);}}}>移动</button></>}
      {deleting&&<><p>将「{deleting.name}」{deleting.type==='folder'?'及其中所有文件':''}移到回收站？可从回收站恢复。</p><button type="button" disabled={busy} onClick={async()=>{const result=await run(()=>onAction({action:'trash',path:deleting.path}));if(result){setDeleting(null);setSelected('');if(scope===deleting.path||scope.startsWith(deleting.path+'/'))setScope('');}}}>移到回收站</button></>}
      <button type="button" disabled={busy} onClick={()=>{setMove(null);setDeleting(null);setError('');}}>取消</button>
    </dialog>,document.body)}
  </div>;
}

