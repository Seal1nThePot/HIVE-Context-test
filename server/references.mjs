import { isReferenceAttachmentId, referenceAttachmentStore } from './reference-attachments.mjs';

const fail=message=>Object.assign(new Error(message),{status:400});
export const MAX_REFERENCE_CHARACTERS=60000;
export async function resolveReferences({files,state},input){
  if(!input||!Array.isArray(input.sources)||input.sources.length>32)throw fail('参考资料列表无效，最多添加 32 项。');
  if(!Number.isInteger(input.budget)||input.budget<0||input.budget>MAX_REFERENCE_CHARACTERS)throw fail('参考资料长度无效。');
  const sources=[],sourceKeys=new Set(),attachmentIds=new Set(),candidates=[],seen=new Set(),warnings=[];
  let overflow=false;
  for(const item of input.sources){
    if(item?.type==='attachment'){
      if(!isReferenceAttachmentId(item.id)||typeof item.path!=='string'||item.path.length>1000)
        throw fail('参考附件标识无效。');
      if(attachmentIds.has(item.id))continue;
      const reference={type:'attachment',id:item.id,path:item.path};
      attachmentIds.add(item.id);
      sources.push(reference);
      if(candidates.length>=256){overflow=true;continue;}
      candidates.push({path:reference.path,source:reference.path,attachment:reference});
      continue;
    }
    if(!item||!['file','folder'].includes(item.type)||typeof item.path!=='string'||item.path.length>2000)throw fail('参考资料路径无效。');
    const path=item.path.replace(/\\/g,'/');await files.resolve(path,item.type==='folder');
    const key=path.toLocaleLowerCase();if(sourceKeys.has(key))continue;sourceKeys.add(key);sources.push({path,type:item.type});
    let paths;
    if(item.type==='folder'){
      // list() excludes hidden entries and symbolic links; resolve() validates the selected root.
      try{const target=await files.resolve(path,true);const tree=await files.list(target,path+'/');const flatten=items=>items.flatMap(entry=>entry.type==='file'?(/\.md$/i.test(entry.path)?[entry.path]:[]):flatten(entry.children||[]));paths=flatten(tree).sort((a,b)=>a.localeCompare(b,'zh-CN',{numeric:true}));}
      catch{throw fail('无法读取参考文件夹“'+path+'”，请检查它是否仍然存在。');}
      if(!paths.length)warnings.push('文件夹“'+path+'”中没有可读取的 Markdown 笔记。');
    }else paths=[path];
    for(const path of paths){const key=path.toLocaleLowerCase();if(seen.has(key))continue;seen.add(key);
      if(input.currentFile&&key===String(input.currentFile).replace(/\\/g,'/').toLocaleLowerCase()){warnings.push('“'+path+'”已包含在当前正文中，不重复加入。');continue;}
      if(candidates.length>=256){overflow=true;continue;}candidates.push({path,source:item.path,explicit:item.type==='file'});
    }
  }
  if(overflow)warnings.push('参考笔记超过 256 份，仅处理优先级靠前的 256 份。');
  const overrides=new Map();let overrideLength=0;
  if(input.overrides!==undefined){if(!Array.isArray(input.overrides)||input.overrides.length>64)throw fail('未保存参考稿无效。');
    for(const value of input.overrides){if(!value||typeof value.path!=='string'||typeof value.text!=='string'||!Number.isInteger(value.characters)||value.characters<value.text.length||value.characters>2000000)throw fail('未保存参考稿无效。');overrideLength+=value.text.length;if(overrideLength>MAX_REFERENCE_CHARACTERS)throw fail('未保存参考稿过长。');overrides.set(value.path.toLocaleLowerCase(),value);}
  }
  const included=[];let remaining=input.budget;
  for(const candidate of candidates){
    if(remaining<=0){warnings.push('未加入“'+candidate.path+'”：本轮参考空间已满。');continue;}
    const {attachment,explicit}=candidate;
    let {path,source}=candidate;
    let disk;
    try{
      if(attachment){
        disk=await referenceAttachmentStore(state).read(attachment.id);
        attachment.path=source=path=disk.name;
      }else disk=await files.read(path);
    }catch(error){
      if(attachment){if(error.code!=='ENOENT')throw error;throw fail('参考附件“'+path+'”已不存在，请重新添加。');}
      if(explicit)throw fail('无法读取参考笔记“'+path+'”：'+error.message);
      warnings.push('未加入“'+path+'”：无法读取。');
      continue;
    }
    const override=attachment?undefined:overrides.get(path.toLocaleLowerCase()),text=override?.text??disk.text,characters=override?.characters??text.length;
    if(override&&characters>0&&!text.length){warnings.push('未加入“'+candidate.path+'”：未保存内容超出本轮空间，请提高优先级或先保存。');continue;}
    const selected=text.slice(0,remaining),truncated=selected.length<characters;
    included.push({path,source,text:selected,characters,truncated,...(override?{unsaved:true}:{})});remaining-=selected.length;
    if(truncated)warnings.push('“'+candidate.path+'”已截短，优先保留开头 '+selected.length+' 个字符。');
  }
  return {sources,files:included,warnings};
}
