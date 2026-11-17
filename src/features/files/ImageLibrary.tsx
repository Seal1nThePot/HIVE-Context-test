import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {usePanelDocument} from '../../shared/panelDocument';
import {useFileWorkspace} from './WorkspaceContext';
import './image-library.css';

type ImageItem={name:string;path:string};
type Details={matches:{path:string;lines:number[]}[];skipped:string[]};
export type ImageLibraryProps={workspaceId:string;file:string;refreshKey?:number;onClose:()=>void};
export default function ImageLibrary({workspaceId,file,refreshKey=0,onClose}:ImageLibraryProps){
  const space=useFileWorkspace(),document=usePanelDocument();
  const [items,setItems]=useState<ImageItem[]>([]),[query,setQuery]=useState(''),[selected,setSelected]=useState<ImageItem|null>(null),[details,setDetails]=useState<Details|null>(null),[detailsError,setDetailsError]=useState(''),[preview,setPreview]=useState<{name:string;url:string}|null>(null),[status,setStatus]=useState(''),[loading,setLoading]=useState(false),[version,setVersion]=useState(0);
  const generation=useRef(0),activeWorkspace=useRef(workspaceId);
  if(activeWorkspace.current!==workspaceId){activeWorkspace.current=workspaceId;generation.current++;}
  useEffect(()=>{generation.current++;setQuery('');setItems([]);setSelected(null);setDetails(null);setDetailsError('');setPreview(null);setStatus('');},[workspaceId]);
  useEffect(()=>()=>{generation.current++;},[]);
  useEffect(()=>{generation.current++;setPreview(null);},[selected]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview.url);},[preview]);
  useEffect(()=>{const controller=new AbortController();let live=true;setLoading(true);setStatus('');
    void space.request('/api/import',{signal:controller.signal}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);if(live){setItems(data);setSelected(previous=>{if(!previous)return null;const next=(data as ImageItem[]).find(item=>item.path===previous.path);return !next?null:next.name===previous.name?previous:next;});}}).catch(e=>{if(live&&e.name!=='AbortError')setStatus(e.message);}).finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;controller.abort();};
  },[workspaceId,refreshKey,version,space.request]);
  useEffect(()=>{if(!selected)return;const controller=new AbortController();let live=true;setDetails(null);setDetailsError('');
    void space.request('/api/import/references?path='+encodeURIComponent(selected.path),{signal:controller.signal}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);if(live)setDetails(data);}).catch(e=>{if(live&&e.name!=='AbortError')setDetailsError('引用扫描失败：'+e.message);});
    return()=>{live=false;controller.abort();};
  },[selected,workspaceId,refreshKey,version,space.request]);
  function markdown(item:ImageItem){const from=file.split('/').slice(0,-1),to=item.path.split('/');while(from.length&&to.length&&from[0]===to[0]){from.shift();to.shift();}const relative=[...from.map(()=> '..'),...to].map(part=>part==='..'?part:encodeURIComponent(part).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())).join('/');return '!['+item.name.replace(/[\\\[\]]/g,'\\$&')+']('+relative+')';}
  async function copy(item:ImageItem){try{await navigator.clipboard.writeText(markdown(item));setStatus('已复制图片引用。');}catch{setStatus('无法复制，请检查剪贴板权限。');}}
  async function show(item:ImageItem){const current=++generation.current;try{const r=await space.request('/api/import/image?path='+encodeURIComponent(item.path));if(!r.ok){const data=await r.json();throw new Error(data.error);}const blob=await r.blob();if(current!==generation.current)return;setPreview({name:item.name,url:URL.createObjectURL(blob)});}catch(e){if(current===generation.current)setStatus((e as Error).message);}}
  const filtered=items.filter(item=>(item.name+' '+item.path).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return createPortal(<>
    <dialog className="explorer-dialog image-library image-library-dialog" aria-label="图片详情" ref={element=>{if(element&&!element.open)element.showModal();}} onKeyDown={event=>event.stopPropagation()} onContextMenu={event=>event.stopPropagation()} onCancel={event=>{event.preventDefault();onClose();}}>
      <div className="image-library-header"><h2>图片详情</h2><button type="button" onClick={()=>setVersion(v=>v+1)}>刷新</button><button type="button" aria-label="关闭图片详情" onClick={onClose}>关闭</button></div>
      <section className="image-library-panel" aria-label="导入的图片">
        <input aria-label="搜索图片" placeholder="搜索图片名称或路径" value={query} onChange={e=>setQuery(e.target.value)}/>
        {loading?<p>正在读取图片…</p>:filtered.length===0?<p>{items.length?'没有匹配的图片。':'暂无导入的图片。'}</p>:<div className="image-library-list">{filtered.map(item=><button type="button" key={item.path} className={selected?.path===item.path?'selected':''} onClick={()=>{setStatus('');setSelected(item);}} title={item.path}>{item.name}</button>)}</div>}
        {selected&&<div className="image-library-details">
          <p><strong>名称：</strong>{selected.name}</p><p><strong>仓库路径：</strong>{selected.path}</p><p><strong>{file?'当前文档':'仓库根目录'}的 Markdown 引用：</strong></p><code>{markdown(selected)}</code>
          <div className="image-library-actions"><button type="button" onClick={()=>void copy(selected)}>复制引用</button><button type="button" onClick={()=>void show(selected)}>预览</button></div>
          <strong>引用此图片的已保存文档</strong><p className="image-library-note">仅扫描仓库内已保存的 Markdown 图片语法；未保存内容、HTML 图片、隐藏目录及符号链接不包含在内；含 HTML 实体的路径可能无法识别。</p>
          {details?<>{details.skipped.length>0&&<p role="alert">扫描不完整，无法读取：{details.skipped.join('、')}</p>}{details.matches.length?<ul>{details.matches.map(match=><li key={match.path}>{match.path}（第 {match.lines.join('、')} 行）</li>)}</ul>:<p>{details.skipped.length?'已扫描部分未发现引用。':'未发现 Markdown 图片引用。'}</p>}</>:<p role={detailsError?'alert':undefined}>{detailsError||'正在读取引用详情…'}</p>}
        </div>}{status&&<p role="status">{status}</p>}
      </section>
    </dialog>
    {preview&&<dialog className="explorer-dialog explorer-image-preview" aria-label="图片预览" ref={element=>{if(element&&!element.open)element.showModal();}} onKeyDown={event=>event.stopPropagation()} onContextMenu={event=>event.stopPropagation()} onCancel={event=>{event.preventDefault();generation.current++;setPreview(null);}}><h2>{preview.name}</h2><img src={preview.url} alt={preview.name}/><button type="button" onClick={()=>{generation.current++;setPreview(null);}}>关闭</button></dialog>}
  </>,document.body);
}
