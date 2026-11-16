import { describe, it, expect } from "vitest";
import { ChangeSet, EditorState } from "@codemirror/state";
import {
  annotationMessages,
  annotationSignature,
  mapAnnotations,
  mergeAnnotationRecords,
  textFingerprint,
  validateSubmission,
  type TextAnnotation,
} from "./annotations";
import {
  annotationHighlights,
  setAnnotationMarks,
} from "./annotationDecorations";
function item(id: string, original = "原文", from = 0): TextAnnotation {
  return {
    id,
    source: "document",
    file: "test.md",
    from,
    to: from + original.length,
    original,
    note: "请说明这里。",
    stale: false,
    createdAt: "2026-11-15T00:00:00Z",
  };
}
describe("text annotations", () => {
  it("tracks the second repeated phrase by coordinates after unrelated edits", () => {
    const doc = "相同。\n相同。",
      a = item("second", "相同。", 4),
      changes = ChangeSet.of({ from: 0, insert: "用户新增。" }, doc.length),
      mapped = mapAnnotations([a], changes);
    const now = changes.apply(EditorState.create({ doc }).doc).toString();
    expect(mapped[0].from).toBe(9);
    expect(validateSubmission(mapped, now, "test.md")[0].original).toBe(
      "相同。",
    );
  });
  it("invalidates only touched annotations and blocks stale submissions", () => {
    const doc = "甲句。乙句。",
      changes = ChangeSet.of({ from: 0, to: 1, insert: "新甲" }, doc.length),
      mapped = mapAnnotations(
        [item("a", "甲句。"), item("b", "乙句。", 3)],
        changes,
      ),
      now = changes.apply(EditorState.create({ doc }).doc).toString();
    expect(mapped[0].stale).toBe(true);
    expect(mapped[1].stale).toBe(false);
    expect(() => validateSubmission([mapped[0]], now, "test.md")).toThrow(
      "原文已变化",
    );
    expect(validateSubmission([mapped[1]], now, "test.md")).toHaveLength(1);
  });
  it("retains stale notes after the source text is entirely deleted", () => {
    const a = item("a", "原文"),
      mapped = mapAnnotations(
        [a],
        ChangeSet.of({ from: 0, to: 2, insert: "" }, 2),
      )[0];
    expect(mapped.stale).toBe(true);
    expect(mapped.note).toBe(a.note);
    expect(mapped.original).toBe("原文");
    expect(mapped.to).toBeGreaterThanOrEqual(mapped.from);
  });
  it("rejects cross-file and empty submissions", () => {
    expect(() => validateSubmission([item("a")], "原文", "other.md")).toThrow();
    expect(() => validateSubmission([], "原文", "test.md")).toThrow("勾选");
  });
  it("serializes exactly the supplied quote and note without unrelated source text", () => {
    const messages = annotationMessages(
        [item("a", "所选句子")],
        "只解释这句",
        [],
      ),
      body = messages.at(-1)!.content;
    expect(body).toContain("所选句子");
    expect(body).toContain("请说明这里。");
    expect(body).toContain("只解释这句");
    expect(body).not.toContain("<document>");
    expect(messages[0].content).toContain("不得声称已改正文");
  });
  it("numbers a mixed document/scratch batch and preserves per-item notes", () => {
    const second = {
      ...item("b", "草稿片段"),
      source: "scratch" as const,
      file: "自由草稿",
      note: "第二条要求",
    };
    const body = annotationMessages([item("a"), second], "逐条讨论", []).at(
      -1,
    )!.content;
    expect(body).toContain("[标注 1]");
    expect(body).toContain("[标注 2]");
    expect(body).toContain("独立草稿");
    expect(body).toContain("第二条要求");
  });
  it("requires a new response when the note changes", () => {
    const a = item("a");
    expect(annotationSignature(a)).not.toBe(
      annotationSignature({ ...a, note: "新的要求" }),
    );
  });
  it("checks the combined request size instead of silently truncating quotes", () => {
    expect(() =>
      annotationMessages([item("a", "字".repeat(120001))], "", []),
    ).toThrow("12 万");
  });
  it("fingerprints the whole source consistently for reload validation", async () => {
    expect(await textFingerprint("原文😀")).toBe(
      await textFingerprint("原文😀"),
    );
    expect(await textFingerprint("原文😀")).not.toBe(
      await textFingerprint("原文😁"),
    );
  });
  it("merges independent new annotations from two windows", () => {
    expect(
      mergeAnnotationRecords([], [item("mine")], [item("other")])
        .map((a) => a.id)
        .sort(),
    ).toEqual(["mine", "other"]);
  });
  it("merges independent edits without losing either note", () => {
    const a = item("a"),
      b = item("b");
    const merged = mergeAnnotationRecords(
      [a, b],
      [{ ...a, note: "我改A" }, b],
      [a, { ...b, note: "另一窗口改B" }],
    );
    expect(merged.map((i) => i.note)).toEqual(["我改A", "另一窗口改B"]);
  });
  it("detects a conflicting edit to the same note and keeps the input snapshots untouched", () => {
    const base = item("a"),
      mine = { ...base, note: "我的" },
      other = { ...base, note: "别处的" };
    expect(() => mergeAnnotationRecords([base], [mine], [other])).toThrow(
      "同一条标注",
    );
    expect(mine.note).toBe("我的");
    expect(other.note).toBe("别处的");
  });
  it("ignores object property order during merge comparisons", () => {
    const original = item("a"),
      reordered = Object.fromEntries(
        Object.entries(original).reverse(),
      ) as TextAnnotation;
    expect(
      mergeAnnotationRecords(
        [original],
        [{ ...original, note: "新备注" }],
        [reordered],
      )[0].note,
    ).toBe("新备注");
  });
  it("maps editor highlight decorations through ordinary text changes", () => {
    let state = EditorState.create({
      doc: "abcdef",
      extensions: [annotationHighlights],
    });
    state = state.update({
      effects: setAnnotationMarks.of([
        { id: "a", from: 2, to: 4, note: "备注" },
      ]),
    }).state;
    state = state.update({ changes: { from: 0, insert: "X" } }).state;
    const ranges: number[][] = [];
    state
      .field(annotationHighlights)
      .between(0, state.doc.length, (from, to) => {
        ranges.push([from, to]);
      });
    expect(ranges).toEqual([[3, 5]]);
  });
});


import { subtractAnnotationRanges } from './annotations';
it('partial unmark keeps both fragments and their notes', () => {
  const item = {id:'one',source:'document' as const,file:'a.md',from:0,to:6,original:'abcdef',note:'keep',createdAt:'2026-01-01',stale:false};
  const result = subtractAnnotationRanges([item],[{from:2,to:4}],'abcdef');
  expect(result.map(({from,to,original,note})=>({from,to,original,note}))).toEqual([{from:0,to:2,original:'ab',note:'keep'},{from:4,to:6,original:'ef',note:'keep'}]);
  expect(result[0].id).not.toBe(result[1].id);
});



it('rebuilds table preview with restored annotations on mark effect', async () => {
  const {makeState}=await import('../editor/Editor');
  const {markdownPreview}=await import('../editor/markdownDisplay');
  const text='| A | B |\n| --- | --- |\n| one | two |';
  const initial=makeState(text,()=>{});
  const from=text.indexOf('one');
  const restored=initial.update({effects:setAnnotationMarks.of([{id:'persisted',from,to:from+3,note:'note'}])}).state;
  let found=false;
  restored.field(markdownPreview).between(0,text.length,(_from,_to,deco)=>{const widget=deco.spec.widget as {marks?:{id:string}[]}|undefined;if(widget?.marks?.some(mark=>mark.id==='persisted'))found=true;});
  expect(found).toBe(true);
});
