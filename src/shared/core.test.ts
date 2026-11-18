import { describe, it, expect } from "vitest";
import { ChangeSet, EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import {
  canApply,
  headings,
  makePrompt,
  mapAnchor,
  minimalReplacement,
  parseAnswer,
  parseSuggestion,
  readAnswer,
  streamPreview,
  visibleCount,
  type Anchor,
} from "./core";

function anchor(text: string, from: number, to: number): Anchor {
  return {
    from,
    to,
    original: text.slice(from, to),
    file: "test.md",
    stale: false,
  };
}
describe("range ownership and review", () => {
  it("targets the second repeated sentence by coordinates", () => {
    const doc = "相同句子。\n\n相同句子。";
    const a = anchor(doc, 7, 12);
    expect(canApply(a, doc, "test.md")).toBe(true);
    const changes = ChangeSet.of(
      { from: a.from, to: a.to, insert: "新的句子。" },
      doc.length,
    );
    expect(changes.apply(EditorState.create({ doc }).doc).toString()).toBe(
      "相同句子。\n\n新的句子。",
    );
  });
  it("maps past edits outside the target without losing them", () => {
    const doc = "前文。目标句。后文。",
      a = anchor(doc, 3, 7);
    const changes = ChangeSet.of({ from: 0, insert: "用户新写的" }, doc.length),
      mapped = mapAnchor(a, changes);
    const now = changes.apply(EditorState.create({ doc }).doc).toString();
    expect(mapped.stale).toBe(false);
    expect(canApply(mapped, now, "test.md")).toBe(true);
    expect(mapped.from).toBe(8);
  });
  it("invalidates overlapping edits even when content is later restored", () => {
    const doc = "前文。目标句。后文。",
      a = anchor(doc, 3, 7);
    const changes = ChangeSet.of({ from: 4, to: 5, insert: "新" }, doc.length),
      mapped = mapAnchor(a, changes);
    expect(mapped.stale).toBe(true);
    expect(canApply(mapped, doc, "test.md")).toBe(false);
  });
  it("keeps new text at both replacement boundaries outside the AI range", () => {
    const doc = "AA目标BB",
      a = anchor(doc, 2, 4);
    const changes = ChangeSet.of(
        [
          { from: 2, insert: "左" },
          { from: 4, insert: "右" },
        ],
        doc.length,
      ),
      mapped = mapAnchor(a, changes);
    const now = changes.apply(EditorState.create({ doc }).doc).toString();
    expect(mapped.stale).toBe(false);
    expect(now.slice(mapped.from, mapped.to)).toBe("目标");
    expect(canApply(mapped, now, "test.md")).toBe(true);
  });
  it("rejects edits at an exact insertion point", () => {
    const a = anchor("abcdef", 3, 3),
      mapped = mapAnchor(a, ChangeSet.of({ from: 3, insert: "x" }, 6));
    expect(mapped.stale).toBe(true);
  });
  it("rejects cross-file application and unmatched baseline content", () => {
    const a = anchor("abc", 0, 2);
    expect(canApply(a, "abc", "other.md")).toBe(false);
    expect(canApply(a, "xbc", "test.md")).toBe(false);
  });
  it("undo preserves manual changes outside accepted AI text", () => {
    const doc = "前文。AI新段。后文。";
    const a = { ...anchor(doc, 3, 8), before: "旧段。" };
    const changes = ChangeSet.of(
        { from: doc.length, insert: "手写的后续。" },
        doc.length,
      ),
      mapped = mapAnchor(a, changes);
    const now = changes.apply(EditorState.create({ doc }).doc);
    expect(canApply(mapped, now.toString(), "test.md")).toBe(true);
    const restored = ChangeSet.of(
      { from: mapped.from, to: mapped.to, insert: mapped.before },
      now.length,
    )
      .apply(now)
      .toString();
    expect(restored).toBe("前文。旧段。后文。手写的后续。");
  });
  it("blocks undo after edits inside accepted text", () => {
    const doc = "前文。AI新段。后文。",
      a = anchor(doc, 3, 8),
      mapped = mapAnchor(
        a,
        ChangeSet.of({ from: 5, insert: "用户" }, doc.length),
      );
    expect(mapped.stale).toBe(true);
  });
  it("owns only a changed word inside a larger selected paragraph", () => {
    const doc = "第一句。措辞很清楚。最后一句。";
    const change = minimalReplacement(
      anchor(doc, 0, doc.length),
      "第一句。措辞足够清楚。最后一句。",
    );
    expect(change.original).toBe("很");
    expect(change.text).toBe("足够");
    expect(change.from).toBe(6);
    expect(change.to).toBe(7);
  });
  it("keeps a change minimal when the reply drops the selection's trailing newline", () => {
    const doc = "台灯在桌面投下一小圈暖黄。\n雨点敲在青石板上。\n";
    const change = minimalReplacement(
      anchor(doc, 0, doc.length),
      "路灯在桌面投下一小圈暖黄。\n雨点敲在青石板上。",
    );
    expect(change.original).toBe("台");
    expect(change.text).toBe("路");
    expect(change.from).toBe(0);
    expect(change.to).toBe(1);
  });
  it("does not split Unicode surrogate pairs when computing minimal changes", () => {
    const doc = "前文😀后文",
      change = minimalReplacement(anchor(doc, 0, doc.length), "前文😁后文");
    expect(change.original).toBe("😀");
    expect(change.text).toBe("😁");
    expect(change.to - change.from).toBe(2);
  });
});
describe("outline and generation contract", () => {
  it("parses real Markdown headings and ignores code fences", () => {
    const doc =
      "# 文档\n\n```md\n## 不是标题\n```\n\n## 正文章节\n\nSetext\n---\n";
    expect(
      headings(EditorState.create({ doc, extensions: [markdown()] })).map(
        (h) => h.title,
      ),
    ).toEqual(["文档", "正文章节", "Setext"]);
  });
  it("counts Unicode code points, punctuation, and visible Markdown text", () => {
    expect(visibleCount("**你好**， [世界](https://example.com)！ 😀")).toBe(7);
  });
  it("does not discard literal underscores or code content from the count", () => {
    expect(visibleCount("a_b `c_d`")).toBe(6);
    expect(visibleCount("```js\n一段代码\n```")).toBe(4);
  });
  it("allows a complete paragraph of exactly 100 characters", () => {
    expect(
      parseSuggestion(
        JSON.stringify({ text: "字".repeat(99) + "。" }),
        "continue",
      ).text.length,
    ).toBe(100);
  });
  it("rejects overlong output rather than truncating it", () => {
    expect(() =>
      parseSuggestion(JSON.stringify({ text: "字".repeat(101) }), "continue"),
    ).toThrow("超过 100 字");
  });
  it("uses a custom continuation limit instead of the default 100", () => {
    expect(() =>
      parseSuggestion(
        JSON.stringify({ text: "字".repeat(31) }),
        "continue",
        30,
      ),
    ).toThrow("超过 30 字");
    expect(
      parseSuggestion(
        JSON.stringify({ text: "字".repeat(150) }),
        "continue",
        200,
      ).text,
    ).toHaveLength(150);
  });
  it("puts the configured limit and the selected writing description into the actual prompt", () => {
    const messages = makePrompt(
      "continue",
      "最新正文",
      "",
      "本节",
      "继续",
      [],
      { continuationLimit: 42 },
    );
    expect(messages.at(-1)!.content).toContain("最多42个可见字符");
    expect(messages[0].content).toBe(
      makePrompt("edit", "正文", "选区", "本节", "改一下", [])[0].content,
    );
    const outlineMessages = makePrompt(
      "outline",
      "最新正文",
      "",
      "本节",
      "完成本节",
      [],
      { nodeDescription: "只解释边界，不添加背景。" },
    );
    expect(outlineMessages.at(-1)!.content).toContain(
      "节点写作描述：只解释边界，不添加背景。",
    );
  });
  it("rejects multi-paragraph continuation and malformed JSON", () => {
    expect(() =>
      parseSuggestion(
        JSON.stringify({ text: "第一段。\n\n第二段。" }),
        "continue",
      ),
    ).toThrow("多段");
    expect(() => parseSuggestion("普通文字", "edit")).toThrow();
  });
  it("preserves latest document and previous feedback in next request", () => {
    const result = makePrompt(
      "continue",
      "用户手改后的最新正文。",
      "当前位置",
      "第三节",
      "使用更口语的表达",
      [{ role: "user", content: "不要使用比喻。" }],
    );
    expect(result[1].content).toBe("不要使用比喻。");
    expect(result.at(-1)!.content).toContain("用户手改后的最新正文。");
    expect(result.at(-1)!.content).toContain("使用更口语");
  });
});


describe("条目式协议", () => {
  it("按 [编号] 切块，逐条取出正文", () => {
    const items = parseAnswer("[1]\n雨点砸在瓦片上。\n\n[2]\n他坐了很久。");
    expect(items).toEqual([
      { id: 1, text: "雨点砸在瓦片上。" },
      { id: 2, text: "他坐了很久。" },
    ]);
  });
  it("（空）表示这条不改，不是删除", () => {
    expect(parseAnswer("[1]\n（空）")[0].text).toBe("");
    expect(() => readAnswer("[1]\n（空）", "edit")).toThrow("没有返回可用的正文");
  });
  it("容忍代码围栏与整段纯文本", () => {
    expect(parseAnswer("```\n[1]\n正文\n```")[0].text).toBe("正文");
    expect(parseAnswer("直接一段正文")[0]).toBeUndefined();
    expect(readAnswer("直接一段正文", "edit").text).toBe("直接一段正文");
  });
  it("旧 JSON 契约仍然可用，作为回退", () => {
    expect(readAnswer(JSON.stringify({ text: "候选", reason: "旧契约" }), "edit")).toEqual({ text: "候选", reason: "旧契约" });
  });
  it("续写仍然只接受一个短段并守住字数上限", () => {
    expect(() => readAnswer("[1]\n第一段。\n\n第二段。", "continue")).toThrow("多段");
    expect(() => readAnswer("[1]\n" + "字".repeat(101), "continue")).toThrow("超过 100 字");
    expect(readAnswer("[1]\n" + "字".repeat(99) + "。", "continue").text).toHaveLength(100);
  });
  it("流式预览不显示编号行与（空）占位", () => {
    expect(streamPreview("[1]\n雨点砸在")).toBe("雨点砸在");
    expect(streamPreview("[1]\n（空）")).toBe("");
  });
  it("文档里的行首编号和箭头会被转义，不会伪装成条目", () => {
    const messages = makePrompt("continue", "[1] 文档里的一行\n→ 这一行", "", "本节", "接着写", []);
    const body = messages.at(-1)!.content;
    expect(body).toContain("\\[1] 文档里的一行");
    expect(body).toContain("\\→ 这一行");
    expect(body).toContain("[1] 续写");
  });
  it("system 提示词与模式无关，可稳定命中前缀缓存", () => {
    const a = makePrompt("continue", "正文", "上文", "本节", "接着写", [], { modelLabel: "M" });
    const b = makePrompt("edit", "正文", "选区", "本节", "改一下", [], { modelLabel: "M" });
    expect(a[0].content).toBe(b[0].content);
    expect(a[0].content).toContain("（M）");
  });
});
