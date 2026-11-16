import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export function writingNodeStore(root) {
  const target = path.join(root, "writing-outline-nodes.json");
  let queue = Promise.resolve();
  async function all() {
    try {
      return JSON.parse(await fs.readFile(target, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  }
  async function read(file) {
    const records = await all();
    return Object.hasOwn(records, file)
      ? records[file]
      : { revision: 0, initialized: false, nodes: [] };
  }
  async function save(file, nodes, revision) {
    if (
      !Number.isInteger(revision) ||
      revision < 0 ||
      !Array.isArray(nodes) ||
      nodes.length > 2000
    )
      throw fail("写作大纲数据无效。");
    const ids = new Set();
    const clean = nodes.map((node) => {
      if (
        !node || typeof node.id !== "string" ||
        !node.id ||
        node.id.length > 100 ||
        ids.has(node.id) ||
        typeof node.title !== "string" ||
        !node.title.trim() ||
        node.title.length > 500 ||
        /[\r\n]/.test(node.title) ||
        typeof node.description !== "string" ||
        node.description.length > 10000 ||
        !Number.isInteger(node.level) ||
        node.level < 1 ||
        node.level > 6 ||
        (node.targetHeading !== null &&
          (typeof node.targetHeading !== "string" ||
            node.targetHeading.length > 4000))
      )
        throw fail("大纲节点的标题、描述或层级无效。");
      ids.add(node.id);
      return {
        id: node.id,
        title: node.title.trim(),
        description: node.description,
        level: node.level,
        targetHeading: node.targetHeading,
      };
    });
    const result = queue
      .catch(() => {})
      .then(async () => {
        const records = await all(),
          current = Object.hasOwn(records, file)
            ? records[file]
            : { revision: 0 };
        if (current.revision !== revision)
          throw fail(
            "大纲已在其他窗口变化，请刷新核对后再保存；当前输入没有覆盖磁盘。",
            409,
          );
        const next = {
          revision: revision + 1,
          initialized: true,
          nodes: clean,
        };
        await fs.mkdir(root, { recursive: true });
        const temp = target + "." + randomUUID() + ".tmp";
        try {
          await fs.writeFile(
            temp,
            JSON.stringify({ ...records, [file]: next }, null, 2),
            { encoding: "utf8", flag: "wx" },
          );
          await fs.rename(temp, target);
        } finally {
          await fs.rm(temp, { force: true }).catch(() => {});
        }
        return next;
      });
    queue = result;
    return result;
  }
  return { read, save };
}
