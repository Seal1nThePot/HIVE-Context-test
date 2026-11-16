import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {promises as fs} from 'node:fs';
import os from 'node:os';import path from 'node:path';
import {fileStore} from './files.mjs';import {resolveReferences} from './references.mjs';import {reasoningOptions} from './generation-options.mjs';
let base,root,state,context;
beforeEach(async()=>{base=await fs.mkdtemp(path.join(os.tmpdir(),'hive-references-'));root=path.join(base,'docs');state=path.join(base,'state');await fs.mkdir(root);await fs.mkdir(state);await fs.mkdir(path.join(root,'资料','子目录'),{recursive:true});await fs.writeFile(path.join(root,'优先.md'),'AAA');await fs.writeFile(path.join(root,'资料','B.md'),'BBBB');await fs.writeFile(path.join(root,'资料','子目录','C.md'),'CCCCC');await fs.writeFile(path.join(root,'资料','image.png'),'not markdown');context={files:fileStore(root,state)};});
afterEach(async()=>{const target=path.resolve(base);if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith('hive-references-'))throw new Error('Unexpected cleanup path');await fs.rm(target,{recursive:true,force:true});});
const file=path=>({path,type:'file'}),folder=path=>({path,type:'folder'});
describe('ordered reference snapshots',()=>{
  it('recurses folders, de-duplicates overlaps, skips the current manuscript and re-reads on each request',async()=>{
    const first=await resolveReferences(context,{sources:[file('优先.md'),folder('资料'),file('资料/B.md')],budget:60000,currentFile:'优先.md'});
    expect(first.files.map(item=>item.path)).toEqual(['资料/子目录/C.md','资料/B.md']);expect(first.warnings.join('')).toContain('当前正文');
    await fs.writeFile(path.join(root,'资料','子目录','C.md'),'新内容');const second=await resolveReferences(context,{sources:[folder('资料')],budget:60000});expect(second.files.find(item=>item.path.endsWith('C.md')).text).toBe('新内容');
  });
  it('allocates limited space strictly in source priority order and records truncation and omission',async()=>{
    const value=await resolveReferences(context,{sources:[file('优先.md'),folder('资料')],budget:5});
    expect(value.files.map(item=>item.text)).toEqual(['AAA','CC']);expect(value.files[1].truncated).toBe(true);expect(value.warnings.join('')).toContain('B.md');
    const reversed=await resolveReferences(context,{sources:[folder('资料'),file('优先.md')],budget:5});expect(reversed.files.map(item=>item.text)).toEqual(['CCCCC']);
  });
  it('uses included unsaved editor buffers and preserves original lengths for truncation disclosure',async()=>{
    const value=await resolveReferences(context,{sources:[file('优先.md')],budget:4,overrides:[{path:'优先.md',text:'编辑中的参考',characters:6}]});
    expect(value.files[0]).toMatchObject({text:'编辑中的',characters:6,truncated:true,unsaved:true});expect(await fs.readFile(path.join(root,'优先.md'),'utf8')).toBe('AAA');
  });
  it('never falls back to disk for an unsaved buffer whose text did not fit the preparation budget',async()=>{
    const value=await resolveReferences(context,{sources:[file('优先.md')],budget:100,overrides:[{path:'优先.md',text:'',characters:10}]});expect(value.files).toEqual([]);expect(value.warnings.join('')).toContain('未保存内容');
  });
  it('rejects traversal, unsupported files, missing explicit references and invalid budgets',async()=>{
    for(const sources of [[file('../outside.md')],[file('资料/image.png')],[file('不存在.md')],[folder('不存在')]])await expect(resolveReferences(context,{sources,budget:10})).rejects.toThrow();
    await expect(resolveReferences(context,{sources:[],budget:60001})).rejects.toThrow('长度');await expect(resolveReferences(context,{sources:Array(33).fill(file('优先.md')),budget:1})).rejects.toThrow('32');
  });
  it('does not follow selected symlinks or links encountered in a folder',async()=>{
    const outside=path.join(base,'outside.md');await fs.writeFile(outside,'private');try{await fs.symlink(outside,path.join(root,'资料','link.md'),'file');}catch(error){if(error.code==='EPERM')return;throw error;}
    await expect(resolveReferences(context,{sources:[file('资料/link.md')],budget:100})).rejects.toThrow('链接');
    const value=await resolveReferences(context,{sources:[folder('资料')],budget:100});expect(value.files.some(item=>item.text.includes('private'))).toBe(false);
  });
});
it('only sends an explicit supported reasoning effort and omits the default',()=>{
  expect(reasoningOptions(undefined)).toEqual({});expect(reasoningOptions('default')).toEqual({});expect(reasoningOptions('xhigh')).toEqual({reasoning_effort:'xhigh'});expect(()=>reasoningOptions('unexpected')).toThrow('推理强度');
});
