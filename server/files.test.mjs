import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileStore } from "./files.mjs";
let root, store;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "hive-files-"));
  store = fileStore(root);
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
describe("local Markdown persistence", () => {
  it("preserves CRLF and BOM through a read/save round trip", async () => {
    await fs.writeFile(
      path.join(root, "test.md"),
      "\uFEFF# 标题\r\n\r\n中文😀\r\n",
    );
    const file = await store.read("test.md");
    expect(file.text).toBe("# 标题\n\n中文😀\n");
    expect(file.eol).toBe("CRLF");
    expect(file.bom).toBe(true);
    await store.save({
      ...file,
      baseline: file.hash,
      text: file.text + "追加\n",
    });
    expect(await fs.readFile(path.join(root, "test.md"), "utf8")).toBe(
      "\uFEFF# 标题\r\n\r\n中文😀\r\n追加\r\n",
    );
  });
  it("blocks external modifications rather than overwriting them", async () => {
    await store.save({ path: "test.md", text: "initial", baseline: null });
    const file = await store.read("test.md");
    await fs.writeFile(path.join(root, "test.md"), "external");
    await expect(
      store.save({ path: "test.md", text: "mine", baseline: file.hash }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await store.read("test.md")).text).toBe("external");
  });
  it("does not overwrite existing files during create or rename", async () => {
    const a = await store.save({ path: "a.md", text: "a", baseline: null });
    await store.save({ path: "b.md", text: "b", baseline: null });
    await expect(
      store.save({ path: "b.md", text: "new", baseline: null }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(store.rename("a.md", "b.md", a.hash)).rejects.toMatchObject({
      code: "EEXIST",
    });
    expect((await store.read("a.md")).text).toBe("a");
    expect((await store.read("b.md")).text).toBe("b");
  });
  it("serializes same-file saves so a stale concurrent write fails", async () => {
    const initial = await store.save({
      path: "test.md",
      text: "old",
      baseline: null,
    });
    const results = await Promise.allSettled([
      store.save({ path: "test.md", text: "one", baseline: initial.hash }),
      store.save({ path: "test.md", text: "two", baseline: initial.hash }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await store.read("test.md")).text).toBe("one");
  });
  it("rejects traversal, absolute drives, and non-Markdown files", async () => {
    for (const name of [
      "../escape.md",
      "C:/escape.md",
      "test.txt",
      ".hidden.md",
    ])
      await expect(
        store.save({ path: name, text: "x", baseline: null }),
      ).rejects.toThrow();
  });
  it("creates groups, moves files and lists the updated structure", async () => {
    const a = await store.save({
      path: "a.md",
      text: "# hello",
      baseline: null,
    });
    await store.folder("灵感");
    await store.rename("a.md", "灵感/a.md", a.hash);
    const tree = await store.list();
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].path).toBe("灵感/a.md");
  });
});
