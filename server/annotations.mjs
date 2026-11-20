import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readStateObject } from "./state-json.mjs";
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export function annotationStore(root) {
  const target = path.join(root, "text-annotations.json");
  let queue = Promise.resolve();
  const key = (source, file) => source + ":" + file;
  const all = async () => (await readStateObject(target, '标注存储')) ?? {};
  async function read(source, file) {
    const records = await all();
    return Object.hasOwn(records, key(source, file))
      ? records[key(source, file)]
      : { revision: 0, fingerprint: "", items: [] };
  }
  async function save({ source, file, revision, fingerprint, items }) {
    if (
      !["document", "scratch"].includes(source) ||
      typeof file !== "string" ||
      !Number.isInteger(revision) ||
      revision < 0 ||
      typeof fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(fingerprint) ||
      !Array.isArray(items) ||
      items.length > 2000
    )
      throw fail("文本标注数据格式无效。");
    const ids = new Set();
    const clean = items.map((item) => {
      if (
        typeof item.id !== "string" ||
        !item.id ||
        item.id.length > 100 ||
        ids.has(item.id) ||
        item.source !== source ||
        item.file !== file ||
        !Number.isInteger(item.from) ||
        !Number.isInteger(item.to) ||
        item.from < 0 ||
        item.to < item.from ||
        item.to > 2000000 ||
        typeof item.original !== "string" ||
        !item.original ||
        item.original.length > 2000000 ||
        typeof item.note !== "string" ||
        item.note.length > 20000 ||
        typeof item.stale !== "boolean" ||
        (!item.stale && item.to - item.from !== item.original.length) ||
        (item.order !== undefined && (!Number.isInteger(item.order) || item.order < 0 || item.order >= 4000)) ||
        typeof item.createdAt !== "string" ||
        item.createdAt.length > 80 ||
        (item.respondedSignature !== undefined &&
          typeof item.respondedSignature !== "string")
      )
        throw fail("文本标注的原文、位置或备注无效。");
      ids.add(item.id);
      return {
        id: item.id,
        source,
        file,
        from: item.from,
        to: item.to,
        original: item.original,
        note: item.note,
        stale: item.stale,
        createdAt: item.createdAt,
        ...(item.order!==undefined?{order:item.order}:{}),
        ...(item.respondedSignature
          ? { respondedSignature: item.respondedSignature }
          : {}),
      };
    });
    const result = queue
      .catch(() => {})
      .then(async () => {
        const records = await all(),
          record = Object.hasOwn(records, key(source, file))
            ? records[key(source, file)]
            : { revision: 0 };
        if (record.revision !== revision)
          throw fail(
            "标注已被其他窗口修改，已阻止覆盖。请导出当前标注备份后刷新核对。",
            409,
          );
        const next = { revision: revision + 1, fingerprint, items: clean };
        await fs.mkdir(root, { recursive: true });
        const temp = target + "." + randomUUID() + ".tmp";
        try {
          await fs.writeFile(
            temp,
            JSON.stringify({ ...records, [key(source, file)]: next }, null, 2),
            { encoding: "utf8", flag: "wx" },
          );
          await fs.rename(temp, target);
        } finally {
          await fs.rm(temp, { force: true }).catch(() => {});
        }
        return { revision: next.revision };
      });
    queue = result;
    return result;
  }
  return { read, save };
}
