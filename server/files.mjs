import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileTimes } from "./file-times.mjs";

export const hash = (text) =>
  crypto.createHash("sha256").update(text).digest("hex");
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export function fileStore(root, state) {
  const times = state ? fileTimes(state) : null;
  const locks = new Map();
  let mutations = Promise.resolve();
  function transaction(fn) {
    const task = mutations.catch(() => {}).then(fn);
    mutations = task;
    return task;
  }
  async function resolve(relative, directory = false) {
    if (
      typeof relative !== "string" ||
      !relative.trim() ||
      relative.includes("\0") ||
      relative
        .split(/[\\/]/)
        .some((p) => p === ".." || p.startsWith(".") || /[:*?"<>|]/.test(p))
    )
      throw fail("文件名称无效。");
    if (!directory && path.extname(relative).toLowerCase() !== ".md")
      throw fail("原型只处理 .md 文件。");
    const target = path.resolve(root, relative);
    const rel = path.relative(root, target);
    if (rel.startsWith("..") || path.isAbsolute(rel))
      throw fail("文件必须位于工作空间内。");
    // Do not follow symbolic links or Windows junctions, including parent directories.
    let current = root;
    for (const part of rel.split(path.sep)) {
      current = path.join(current, part);
      try {
        if ((await fs.lstat(current)).isSymbolicLink())
          throw fail("原型不跟随符号链接或目录联接。");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    return target;
  }
  async function exclusive(file, fn) {
    const key = file.toLowerCase();
    const previous = locks.get(key) || Promise.resolve();
    const result = previous.catch(() => {}).then(fn);
    locks.set(key, result);
    try {
      return await result;
    } finally {
      if (locks.get(key) === result) locks.delete(key);
    }
  }
  async function listTree(dir, prefix, timeData, changed) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const relative = prefix + entry.name;
      const stat = await fs.stat(path.join(dir, entry.name));
      const modifiedAt = stat.mtimeMs;
      const observed = times ? times.observe(timeData, relative, stat) : {createdAt:stat.birthtimeMs,dirty:false};
      const createdAt = observed.createdAt;
      changed.value ||= observed.dirty;
      if (entry.isDirectory())
        result.push({
          name: entry.name,
          path: relative,
          type: "folder",
          modifiedAt, createdAt,
          children: await listTree(path.join(dir, entry.name), relative + "/", timeData, changed),
        });
      else if (/\.md$/i.test(entry.name))
        result.push({ name: entry.name, path: relative, type: "file", modifiedAt, createdAt });
    }
    return result.sort((a, b) =>
      a.type === b.type
        ? a.name.localeCompare(b.name, "zh-CN")
        : a.type === "folder"
          ? -1
          : 1,
    );
  }
  async function list(dir = root, prefix = "") {
    const data=times ? await times.read() : {}, changed={value:false};
    const result=await listTree(dir, prefix, data, changed);
    if(times && changed.value)await times.write(data);
    return result;
  }
  async function read(relative) {
    const target = await resolve(relative);
    const stat = await fs.stat(target);
    if (stat.size > 2_000_000)
      throw fail("原型支持 2 MB 以内的 Markdown 文件。");
    const raw = await fs.readFile(target, "utf8");
    return {
      path: relative,
      text: raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n"),
      hash: hash(raw),
      eol: raw.includes("\r\n") ? "CRLF" : "LF",
      bom: raw.startsWith("\uFEFF"),
    };
  }
  async function save({
    path: relative,
    text,
    baseline,
    eol = "LF",
    bom = false,
  }) {
    const target = await resolve(relative);
    if (typeof text !== "string" || Buffer.byteLength(text) > 2_000_000)
      throw fail("文件内容无效或超过 2 MB。");
    return exclusive(target, async () => {
      let old = null;
      try {
        old = await fs.readFile(target, "utf8");
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      if (
        (old !== null && hash(old) !== baseline) ||
        (old === null && baseline != null)
      )
        throw fail(
          "磁盘文件已变化，已阻止覆盖。请另存，或重新打开后核对。",
          409,
        );
      const timeData=times ? await times.read() : null;
      let originalCreatedAt;
      if(times && old !== null) originalCreatedAt=times.observe(timeData,relative,await fs.stat(target)).createdAt;
      const raw =
        (bom ? "\uFEFF" : "") +
        (eol === "CRLF" ? text.replace(/\r?\n/g, "\r\n") : text);
      await fs.mkdir(path.dirname(target), { recursive: true });
      const temp = path.join(
        path.dirname(target),
        `.${path.basename(target)}.${crypto.randomUUID()}.tmp`,
      );
      try {
        await fs.writeFile(temp, raw, { encoding: "utf8", flag: "wx" });
        // Recheck immediately before the atomic replacement, catching external edits during preparation.
        let latest = null;
        try {
          latest = await fs.readFile(target, "utf8");
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
        if (latest !== old)
          throw fail("保存期间磁盘文件发生变化，已阻止覆盖。", 409);
        if (old === null) {
          await fs.link(temp, target);
          await fs.unlink(temp);
        } else await fs.rename(temp, target);
      } finally {
        await fs.rm(temp, { force: true }).catch(() => {});
      }
      if(times) {
        const stat=await fs.stat(target);
        times.replaced(timeData,relative,stat,originalCreatedAt ?? stat.birthtimeMs);
        await times.write(timeData);
      }
      return { hash: hash(raw), path: relative };
    });
  }
  async function folder(relative) {
    const target = await resolve(relative, true);
    await fs.mkdir(target, { recursive: true });
  }
  async function rename(from, to, baseline) {
    const source = await resolve(from),
      target = await resolve(to);
    return exclusive(source, async () => {
      const current = await fs.readFile(source, "utf8");
      if (hash(current) !== baseline)
        throw fail("磁盘文件已变化，请重新打开后整理。", 409);
      const timeData=times ? await times.read() : null;
      const createdAt=times ? times.observe(timeData,from,await fs.stat(source)).createdAt : null;
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.link(source, target); // No silent overwrite of an existing name.
      await fs.unlink(source);
      if(times){delete timeData[from];times.replaced(timeData,to,await fs.stat(target),createdAt);await times.write(timeData);}
      return read(to);
    });
  }
  return { list: (...args) => transaction(() => list(...args)), read, resolve, transaction,
    save: (...args) => transaction(() => save(...args)),
    folder: (...args) => transaction(() => folder(...args)),
    rename: (...args) => transaction(() => rename(...args)) };
}
