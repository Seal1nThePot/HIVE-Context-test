import { promises as fs } from 'node:fs';

export async function readStateObject(file, label) {
  let source;
  try {
    source = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
  let value;
  try {
    value = JSON.parse(source);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new SyntaxError('Expected a JSON object');
    }
  } catch (cause) {
    const message = `${label}文件损坏：${file}\n请先备份打开的文稿并退出 HIVE，再复制保留损坏文件。将有效备份恢复到上述路径后，重新启动 HIVE。`;
    throw Object.assign(new Error(message, {cause}), {code:'HIVE_STATE_CORRUPT',status:500});
  }
  return value;
}
