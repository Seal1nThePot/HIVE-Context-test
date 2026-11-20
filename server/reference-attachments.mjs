import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { decodeImportedMarkdown } from './imports.mjs';

const fail = message => Object.assign(new Error(message), {status:400});
export const isReferenceAttachmentId = id =>
  typeof id === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id);

export function referenceAttachmentStore(state) {
  const directory = path.join(state, 'reference-attachments');

  function target(id) {
    if (!isReferenceAttachmentId(id)) throw fail('参考附件标识无效。');
    return path.join(directory, id + '.json');
  }

  return {
    async add(name, buffer) {
      if (typeof name !== 'string' || name.length > 1000 || /[\\/\x00-\x1f\x7f]/.test(name) || !/\.md$/i.test(name))
        throw fail('请选择 Markdown（.md）文件。');
      const text = decodeImportedMarkdown(buffer).replace(/\r\n/g, '\n');
      const id = randomUUID(), file = target(id), temporary = file + '.tmp';
      await fs.mkdir(directory, {recursive:true});
      try {
        await fs.writeFile(temporary, JSON.stringify({name,text}), {encoding:'utf8',flag:'wx'});
        await fs.rename(temporary, file);
      } finally {
        await fs.rm(temporary, {force:true}).catch(() => {});
      }
      return {type:'attachment',id,path:name};
    },
    async read(id) {
      return JSON.parse(await fs.readFile(target(id), 'utf8'));
    },
    async remove(id) {
      await fs.rm(target(id), {force:true});
    },
  };
}
