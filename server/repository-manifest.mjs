import {randomUUID} from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';

export async function stageJson(file,value){
  const temp=file+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});}
  catch(error){await discardStage(temp);throw error;}
  return temp;
}

export async function discardStage(temp){await fs.rm(temp,{force:true}).catch(()=>{});}

export async function repositoryManifestStore(directory){
  await fs.mkdir(directory,{recursive:true});
  const filename=path.join(directory,'repositories.json');
  return async function synchronize(revision,entries){
    const value={revision,repositories:entries.map(({id,root,name})=>({id,name:name||path.basename(root)||root,path:root}))};
    let saved;
    try{saved=await fs.readFile(filename,'utf8');}
    catch(error){if(error.code!=='ENOENT')throw error;}
    const serialized=JSON.stringify(value,null,2)+'\n';
    if(saved===serialized)return JSON.parse(saved);
    const temp=await stageJson(filename,value);
    try{await fs.rename(temp,filename);}
    finally{await discardStage(temp);}
    return value;
  };
}
