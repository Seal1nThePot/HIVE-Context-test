import path from 'node:path';
import {promises as fs} from 'node:fs';
import {parser} from '@lezer/markdown';

const label = value => value.replace(/^\[|\]$/g,'').replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g,'$1').trim().replace(/\s+/g,' ').toLowerCase();
function destination(raw, document) {
  raw=raw.replace(/^<|>$/g,'').replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g,'$1');
  if(!raw || /^(?:[a-z][a-z\d+.-]*:|\/\/|\/|#)/i.test(raw))return null;
  raw=raw.split(/[?#]/,1)[0];
  try { raw=decodeURIComponent(raw); } catch { return null; }
  if(raw.includes('\\')||raw.includes('\0'))return null;
  const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(document),raw));
  return resolved==='..'||resolved.startsWith('../')?null:resolved;
}
function imageDestinations(text,document) {
  const tree=parser.parse(text),definitions=new Map(),images=[];
  tree.iterate({enter(node){
    if(node.name==='LinkReference'){
      let key='',url='';for(let child=node.node.firstChild;child;child=child.nextSibling){if(child.name==='LinkLabel')key=label(text.slice(child.from,child.to));if(child.name==='URL')url=text.slice(child.from,child.to);}
      if(key&&url&&!definitions.has(key))definitions.set(key,url);
    }
    if(node.name==='Image'){
      let url='',key='';for(let child=node.node.firstChild;child;child=child.nextSibling){if(child.name==='URL')url=text.slice(child.from,child.to);if(child.name==='LinkLabel')key=label(text.slice(child.from,child.to));}
      const imageText=text.slice(node.from,node.to),alt=imageText.match(/^!\[([^\]]*)\]/)?.[1]||'';
      images.push({url,key:key||label(alt),line:text.slice(0,node.from).split('\n').length});
    }
  }});
  return images.map(item=>({...item,path:destination(item.url||definitions.get(item.key)||'',document)}));
}
export async function findImageReferences({root,files},imagePath){
  if(typeof imagePath!=='string'||!/^导入的图片\/[^/\\]+$/.test(imagePath))throw Object.assign(new Error('图片路径无效。'),{status:400});
  const image=await files.resolve(imagePath,true),stat=await fs.lstat(image);
  if(!stat.isFile()||stat.isSymbolicLink())throw Object.assign(new Error('图片不存在。'),{status:400});
  const matches=[],skipped=[];
  async function walk(relative=''){
    let dir,entries;try{dir=relative?await files.resolve(relative,true):root;entries=await fs.readdir(dir,{withFileTypes:true});}catch{skipped.push(relative||'仓库根目录');return;}
    for(const entry of entries){
      if(entry.name.startsWith('.')||entry.isSymbolicLink())continue;
      const name=relative?relative+'/'+entry.name:entry.name;
      if(entry.isDirectory()){await walk(name);continue;}
      if(!entry.isFile()||!/\.md$/i.test(entry.name))continue;
      try{const document=await files.read(name);const lines=imageDestinations(document.text,name).filter(item=>item.path!==null&&(process.platform==='win32'?item.path.toLowerCase()===imagePath.toLowerCase():item.path===imagePath)).map(item=>item.line);if(lines.length)matches.push({path:name,lines});}catch{skipped.push(name);}
    }
  }
  await walk();matches.sort((a,b)=>a.path.localeCompare(b.path,'zh-CN'));
  return {matches,skipped,scope:'saved-markdown'};
}
