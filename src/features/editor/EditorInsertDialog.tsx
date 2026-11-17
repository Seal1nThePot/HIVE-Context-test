import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {EditorView} from '@codemirror/view';
import {X} from 'lucide-react';
import {useFileWorkspace} from '../files/WorkspaceContext';
import {imageMarkdown,insertImage,insertTable} from './insertions';
import './editor-tools.css';

export type InsertTarget={editor:EditorView;file:string;valid:()=>boolean;prepare?:()=>Promise<boolean>};
export default function EditorInsertDialog({kind,target,onClose,onInserted}:{kind:'image'|'table';target:InsertTarget;onClose:()=>void;onInserted:()=>void}){
  const document=target.editor.dom.ownerDocument,window=document.defaultView!;
  const dialog=useRef<HTMLDialogElement>(null),snapshot=useRef(target.editor.state),uploading=useRef(false),space=useFileWorkspace();
  const [rows,setRows]=useState('3'),[columns,setColumns]=useState('3'),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reference,setReference]=useState('');
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null,element=dialog.current;element?.showModal();return()=>{element?.close();if(previous?.isConnected)previous.focus({preventScroll:true});};},[document]);
  async function insert(){if(uploading.current)return;setError('');
    if(!target.valid()||target.editor.state.doc!==snapshot.current.doc){setError('文档内容或位置已变化，请关闭后重新插入。');return;}
    const state=target.editor.state.update({selection:snapshot.current.selection}).state;
    if(kind==='table'){try{target.editor.dispatch(insertTable(state,Number(rows),Number(columns)));onInserted();}catch(error){setError((error as Error).message);}return;}
    if(!file)return;if(file.size>12*1024*1024){setError('请选择 12 MB 以内的图片。');return;}
    try{insertImage(state,'图片pic/校验.png',file.name);}catch(error){setError((error as Error).message);return;}
    uploading.current=true;setBusy(true);
    try{
      if(target.prepare&&!await target.prepare())throw new Error('草稿尚未保存，请处理保存提示后重试。');
      if(!target.valid()||target.editor.state.doc!==snapshot.current.doc)throw new Error('文档内容或位置已变化，请关闭后重新插入。');
      const response=await space.request('/api/images?'+new URLSearchParams({document:target.file,name:file.name}),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'图片保存失败。');
      const markdown=imageMarkdown(data.reference,file.name);setReference(markdown);
      if(!target.valid()||target.editor.state.doc!==snapshot.current.doc)throw new Error('图片已保存，文档内容或位置已变化。可复制图片引用后手动插入。');
      target.editor.dispatch(insertImage(target.editor.state.update({selection:snapshot.current.selection}).state,data.reference,file.name));onInserted();
    }catch(error){setError((error as Error).message);}finally{uploading.current=false;setBusy(false);}
  }
  return createPortal(<dialog ref={dialog} className="editor-insert-dialog" aria-label={kind==='image'?'插入图片':'插入表格'} onCancel={event=>{event.preventDefault();if(!uploading.current)onClose();}}>
    <form onSubmit={event=>{event.preventDefault();void insert();}}><header><h2>{kind==='image'?'插入图片':'插入表格'}</h2><button type="button" className="icon-button" aria-label="关闭插入窗口" disabled={busy} onClick={onClose}><X size={16}/></button></header>
      {kind==='image'?<><label className="insert-image-file">选择图片<input type="file" aria-label="选择插入的图片" accept=".png,.jpg,.jpeg,.gif,.webp" disabled={busy||!!reference} onChange={event=>setFile(event.target.files?.[0]||null)}/></label><p>{target.file.split('/').at(-1)?.replace(/\.md$/i,'')}pic/ · PNG、JPG、GIF、WebP · 最多 12 MB</p></>:<div className="insert-table-size"><label>正文行数<input type="number" aria-label="表格正文行数" min={1} max={20} value={rows} onChange={event=>setRows(event.target.value)}/></label><label>列数<input type="number" aria-label="表格列数" min={1} max={12} value={columns} onChange={event=>setColumns(event.target.value)}/></label><p>表头另占一行，插入后可直接编辑单元格。</p></div>}
      {error&&<p role="alert" className="insert-error">{error}</p>}
      {reference&&<label>图片引用<input aria-label="已保存的图片引用" readOnly value={reference}/><button type="button" onClick={()=>void navigator.clipboard.writeText(reference).catch(()=>setError('无法复制，请手动选择引用文字复制。'))}>复制引用</button></label>}
      <footer><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="submit" className="gold-button" disabled={busy||!!reference||kind==='image'&&!file}>{busy?'正在插入…':'插入'}</button></footer>
    </form>
  </dialog>,document.body);
}
