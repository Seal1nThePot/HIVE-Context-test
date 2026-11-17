const fs=require('node:fs');
const path=require('node:path');

function resolveTemplateSource({projectRoot,executablePath,portableDirectory,override}){
  if(override)return path.resolve(override);
  const anchors=[portableDirectory,executablePath&&path.dirname(executablePath),projectRoot].filter(Boolean);
  for(const anchor of anchors){
    let current=path.resolve(anchor);
    for(let depth=0;depth<5;depth++){
      const candidate=path.join(current,'templates');
      if(!candidate.split(path.sep).some(part=>part.endsWith('.asar'))){
        try{const stat=fs.lstatSync(candidate);if(stat.isDirectory()&&!stat.isSymbolicLink())return candidate;}catch{}
      }
      const parent=path.dirname(current);if(parent===current)break;current=parent;
    }
  }
  return undefined;
}
module.exports={resolveTemplateSource};
