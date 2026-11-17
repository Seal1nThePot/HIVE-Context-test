import path from 'node:path';
import {promises as fs} from 'node:fs';
import {imageType,MAX_IMAGE_BYTES} from './images.mjs';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const folder='导入的图片';
function safeBase(name){
  if(typeof name!=='string'||!name||name.length>1000)throw fail('文件名称无效。');
  const leaf=path.posix.basename(name.replace(/\\/g,'/'));
  const ext=path.posix.extname(leaf).toLowerCase();
  let base=leaf.slice(0,leaf.length-ext.length).replace(/[<>:"/\\|?*\x00-\x1f]/g,'').replace(/^\.+|[. ]+$/g,'').slice(0,100);
  if(!base||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base))base='导入文件';
  return {base,ext};
}
export function importStore({root,files}){
  async function store(name,buffer){return files.transaction(async()=>{
    const {base,ext}=safeBase(name);
    if(!Buffer.isBuffer(buffer))throw fail('文件内容无效。');
    let destination='',extension=ext;
    if(ext==='.md'){
      if(buffer.length>2_000_000)throw fail('Markdown 文件超过 2 MB。');
      try{new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{throw fail('Markdown 文件必须使用 UTF-8 编码。');}
    }else if(['.png','.jpg','.jpeg','.gif','.webp'].includes(ext)){
      const type=imageType(buffer);
      if((ext==='.jpeg'?'.jpg':ext)!==type.extension)throw fail('图片扩展名与实际类型不符。');
      extension=type.extension;destination=folder;
      const dir=await files.resolve(folder,true);await fs.mkdir(dir,{recursive:true});
    }else throw fail('仅支持 Markdown、PNG、JPG、GIF 和 WebP。');
    for(let number=1;number<=1000;number++){
      const relative=[destination,base+(number>1?'-'+number:'')+extension].filter(Boolean).join('/');
      const target=await files.resolve(relative,!!destination);
      try{await fs.writeFile(target,buffer,{flag:'wx'});return {path:relative,kind:destination?'image':'markdown'};}
      catch(error){if(error.code!=='EEXIST')throw error;}
    }
    throw fail('同名文件过多，请更换名称。',409);
  });}
  async function list(){
    const dir=await files.resolve(folder,true);let entries;
    try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return [];throw error;}
    return entries.filter(e=>e.isFile()&&!e.isSymbolicLink()&&/\.(png|jpe?g|gif|webp)$/i.test(e.name)).map(e=>({name:e.name,path:folder+'/'+e.name})).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
  }
  async function read(relative){
    if(typeof relative!=='string'||!relative.startsWith(folder+'/')||relative.slice(folder.length+1).includes('/')||relative.includes('\\'))throw fail('图片路径无效。');
    const target=await files.resolve(relative,true),stat=await fs.lstat(target);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_IMAGE_BYTES)throw fail('图片无效或超过 12 MB。');
    const buffer=await fs.readFile(target);return {buffer,...imageType(buffer)};
  }
  return {store,list,read};
}
