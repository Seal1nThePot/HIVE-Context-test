import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileStore} from './files.mjs';
import {imageStore,imageType,MAX_IMAGE_BYTES} from './images.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=','base64');
let root,outside,files,images;
beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'hive-images-'));outside=await fs.mkdtemp(path.join(os.tmpdir(),'hive-images-outside-'));files=fileStore(root);images=imageStore({root,files});await files.save({path:'资料/文章.md',text:'原文',baseline:null});});
afterEach(async()=>{for(const target of [root,outside]){const relative=path.relative(os.tmpdir(),target);if(relative.startsWith('..')||path.isAbsolute(relative)||!relative.startsWith('hive-images-'))throw new Error('Unexpected cleanup path');await fs.rm(target,{recursive:true,force:true});}});
describe('document image storage',()=>{
  it('stores images beside a document in its same-name pic folder, with a portable relative reference',async()=>{
    const result=await images.store('资料/文章.md','图片 [1]#.png',png);
    expect(result).toEqual({path:'资料/文章pic/图片 [1]#.png',reference:'文章pic/图片 [1]#.png'});
    expect(await fs.readFile(path.join(root,result.path))).toEqual(png);
    expect((await files.read('资料/文章.md')).text).toBe('原文');
    const value=await images.read('资料/文章.md',result.reference.split('/').map(encodeURIComponent).join('/'));
    expect(value.mime).toBe('image/png');expect(value.buffer).toEqual(png);
  });
  it('never overwrites an existing image and derives the extension from image bytes',async()=>{
    const first=await images.store('资料/文章.md','一样.jpg',png),other=Buffer.concat([png,Buffer.from('extra')]),second=await images.store('资料/文章.md','一样.jpg',other);
    expect(first.reference).toBe('文章pic/一样.png');expect(second.reference).toBe('文章pic/一样-2.png');
    expect(await fs.readFile(path.join(root,first.path))).toEqual(png);expect(await fs.readFile(path.join(root,second.path))).toEqual(other);
  });
  it('sanitizes incoming names and serializes simultaneous image writes',async()=>{
    const results=await Promise.all([images.store('资料/文章.md','../../外来.png',png),images.store('资料/文章.md','../../外来.png',png)]);
    expect(results.map(item=>item.reference)).toEqual(['文章pic/外来.png','文章pic/外来-2.png']);
    expect((await images.store('资料/文章.md','CON.jpg',png)).reference).toBe('文章pic/图片.png');
  });
  it('rejects unsupported, oversized or missing-document uploads before creating an asset folder',async()=>{
    await expect(images.store('资料/文章.md','fake.png',Buffer.from('<svg/>'))).rejects.toMatchObject({status:400});
    expect(()=>imageType(Buffer.alloc(MAX_IMAGE_BYTES+1))).toThrow('12 MB');
    await expect(images.store('资料/不存在.md','a.png',png)).rejects.toMatchObject({code:'ENOENT'});
    await expect(fs.stat(path.join(root,'资料/文章pic'))).rejects.toMatchObject({code:'ENOENT'});
  });
  it('serves only relative image files contained in the workspace',async()=>{
    await fs.writeFile(path.join(outside,'outside.png'),png);
    for(const reference of ['https://example.test/a.png','data:image/png;base64,a','C:\\outside.png','/outside.png','../../outside.png','%2e%2e/%2e%2e/outside.png','%ZZ'])await expect(images.read('资料/文章.md',reference)).rejects.toMatchObject({status:400});
    await fs.mkdir(path.join(root,'共享'));await fs.writeFile(path.join(root,'共享/图.png'),png);
    expect((await images.read('资料/文章.md','../共享/图.png')).buffer).toEqual(png);
    await expect(images.read('资料/文章.md','文章.md')).rejects.toMatchObject({status:400});
  });
  it('does not follow a junction or symbolic link for writes or previews',async()=>{
    await fs.writeFile(path.join(outside,'a.png'),png);await fs.symlink(outside,path.join(root,'资料/文章pic'),process.platform==='win32'?'junction':'dir');
    await expect(images.store('资料/文章.md','a.png',png)).rejects.toThrow('符号链接');
    await expect(images.read('资料/文章.md','文章pic/a.png')).rejects.toThrow('符号链接');
    expect(await fs.readFile(path.join(outside,'a.png'))).toEqual(png);
  });
});
