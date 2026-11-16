import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
export function outlineStore(root) {
  const target = path.join(root, "writing-outlines.json");
  let queue = Promise.resolve();
  async function readAll() {
    try {
      return JSON.parse(await fs.readFile(target, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  }
  async function read(file) {
    const all = await readAll();
    return Object.hasOwn(all, file) ? all[file] : {};
  }
  async function save(file, key, description) {
    if (
      typeof file !== "string" ||
      typeof key !== "string" ||
      !key ||
      key.length > 4000 ||
      typeof description !== "string" ||
      description.length > 10000
    )
      throw Object.assign(new Error("大纲节点描述无效或过长。"), {
        status: 400,
      });
    const result = queue
      .catch(() => {})
      .then(async () => {
        const all = await readAll();
        const next = {
          ...all,
          [file]: {
            ...(Object.hasOwn(all, file) ? all[file] : {}),
            [key]: description,
          },
        };
        await fs.mkdir(root, { recursive: true });
        const temp = target + "." + randomUUID() + ".tmp";
        try {
          await fs.writeFile(temp, JSON.stringify(next, null, 2), {
            encoding: "utf8",
            flag: "wx",
          });
          await fs.rename(temp, target);
        } finally {
          await fs.rm(temp, { force: true }).catch(() => {});
        }
        return next[file];
      });
    queue = result;
    return result;
  }
  return { read, save };
}
