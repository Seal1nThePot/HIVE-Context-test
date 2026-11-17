import {describe,it,expect} from 'vitest';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileStore} from './files.mjs';
import {findImageReferences} from './image-references.mjs';

describe('saved image references',()=>{
 it('resolves encoded paths and reference definitions relative to each document, ignoring code and other paths',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'hive-image-ref-'));
  try{
   await fs.mkdir(path.join(root,'导入的图片'));await fs.mkdir(path.join(root,'章节'));await fs.mkdir(path.join(root,'其他'));
   await fs.writeFile(path.join(root,'导入的图片','同 名.png'),'image');
   await fs.writeFile(path.join(root,'章节','一.md'),'![a](../导入的图片/同%20名.png)\n![b][pic]\n\n[pic]: <../导入的图片/同%20名.png>\n\n`![c](../导入的图片/同%20名.png)`\n![d](../其他/同%20名.png)\n![e](https://x/同%20名.png)');
   await fs.writeFile(path.join(root,'根.md'),'![a](导入的图片/同%20名.png)');
   await fs.writeFile(path.join(root,'大.md'),Buffer.alloc(2000001));
   const result=await findImageReferences({root,files:fileStore(root)},'导入的图片/同 名.png');
   expect(result.matches).toEqual(expect.arrayContaining([{path:'章节/一.md',lines:[1,2]},{path:'根.md',lines:[1]}]));expect(result.matches).toHaveLength(2);expect(result.skipped).toContain('大.md');
   await expect(findImageReferences({root,files:fileStore(root)},'导入的图片/../根.md')).rejects.toThrow();
  }finally{await fs.rm(root,{recursive:true,force:true});}
 });
});
