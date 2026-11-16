import path from 'node:path';
import {promises as fs} from 'node:fs';

export const MAX_IMAGE_BYTES=12*1024*1024;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function imageType(buffer){
  if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>MAX_IMAGE_BYTES)throw fail('请选择 12 MB 以内的图片。');
  if(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {extension:'.png',mime:'image/png'};
  if(buffer[0]===255&&buffer[1]===216&&buffer[2]===255)return {extension:'.jpg',mime:'image/jpeg'};
  if(/^GIF8[79]a$/.test(buffer.subarray(0,6).toString('ascii')))return {extension:'.gif',mime:'image/gif'};
  if(buffer.subarray(0,4).toString('ascii')==='RIFF'&&buffer.subarray(8,12).toString('ascii')==='WEBP')return {extension:'.webp',mime:'image/webp'};
  throw fail('支持 PNG、JPG、GIF 和 WebP 图片。');
}
export function imageStore({root,files}){
  async function store(document,name,buffer){return files.transaction(async()=>{
    const type=imageType(buffer),file=await files.resolve(document);await files.read(document);
    if(typeof name!=='string'||name.length>1000)throw fail('图片名称无效。');
    const original=path.posix.basename(name.replace(/\\/g,'/')),extension=path.posix.extname(original);
    let base=original.slice(0,original.length-extension.length).replace(/[<>:"/\\|?*\x00-\x1f]/g,'').replace(/^\.+|[. ]+$/g,'').slice(0,100)||'图片';
    if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base))base='图片';
    const folder=path.join(path.dirname(file),path.basename(file,path.extname(file))+'pic'),relativeFolder=path.relative(root,folder);
    await files.resolve(relativeFolder,true);await fs.mkdir(folder,{recursive:true});
    for(let number=1;number<=1000;number++){
      const target=path.join(folder,base+(number>1?'-'+number:'')+type.extension),relative=path.relative(root,target);
      await files.resolve(relative,true);
      try{await fs.writeFile(target,buffer,{flag:'wx'});return {path:relative.split(path.sep).join('/'),reference:path.relative(path.dirname(file),target).split(path.sep).join('/')};}
      catch(error){if(error.code!=='EEXIST')throw error;}
    }
    throw fail('同名图片过多，请更换图片名称。',409);
  });}
  async function read(document,reference){
    const file=await files.resolve(document);await files.read(document);
    if(typeof reference!=='string'||reference.length>3000)throw fail('图片路径无效。');
    let value=reference.replace(/^<|>$/g,'');try{value=decodeURIComponent(value);}catch{throw fail('图片路径编码无效。');}
    if(/^(?:[a-z][a-z\d+.-]*:|[\\/])/i.test(value)||value.includes('\0'))throw fail('仅预览写作空间内的相对图片路径。');
    const target=await files.resolve(path.relative(root,path.resolve(path.dirname(file),value.replace(/\\/g,'/'))),true);
    if(!/\.(png|jpe?g|gif|webp)$/i.test(target))throw fail('图片格式不受支持。');
    const stat=await fs.lstat(target);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_IMAGE_BYTES)throw fail('图片无效或超过 12 MB。');
    const buffer=await fs.readFile(target);return {buffer,...imageType(buffer)};
  }
  return {store,read};
}
