import {useState} from 'react';
import {imageFileUrl} from './fileKinds';
import './image-file-view.css';

export default function ImageFileView({path,workspaceId}:{path:string;workspaceId:string}){
  const [failed,setFailed]=useState(false),[revision,setRevision]=useState(0);
  return <section className="image-file-view" aria-label="图片查看器">
    <div className="image-file-heading"><strong title={path}>{path.split('/').at(-1)}</strong><span>{path.split('.').at(-1)?.toUpperCase()} 图片 · 只读</span><button type="button" onClick={()=>{setFailed(false);setRevision(value=>value+1);}}>重新加载</button></div>
    {failed?<p role="alert">无法显示图片，文件可能已移动、删除或格式不受支持。</p>:<div className="image-file-canvas"><img key={path+revision} src={imageFileUrl(path,workspaceId)+'&revision='+revision} alt={path.split('/').at(-1)||'图片'} onError={()=>setFailed(true)}/></div>}
  </section>;
}
