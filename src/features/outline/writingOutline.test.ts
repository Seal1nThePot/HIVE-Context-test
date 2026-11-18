import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { headings, makePrompt } from "../../shared/core";
import { initialWritingNodes, headingKey, moveWritingNode, targetForNode } from "./writingNodes";

describe("workspace and independent writing outline", () => {
  it("migrates existing descriptions and preserves node identity when ordering", () => {
    const items = headings(EditorState.create({doc:"# 文章\n\n## 开头\n\n## 后续",extensions:[markdown()]}));
    const nodes = initialWritingNodes(items, {[headingKey(items, items[1])]: "先举例，再解释"});
    expect(nodes.map(node=>node.title)).toEqual(["开头", "后续"]);
    expect(nodes[0].description).toBe("先举例，再解释");
    expect(targetForNode(nodes[0], items)).toEqual(items[1]);
    expect(targetForNode({...nodes[0],targetHeading:null},items)).toBeUndefined();
    expect(moveWritingNode(nodes,nodes[0].id,1).map(node=>node.id)).toEqual([nodes[1].id,nodes[0].id]);
    expect(nodes[0].title).toBe("开头");
  });
  it("passes the independently arranged outline and selected requirement to writing", () => {
    const messages=makePrompt("outline","# 正文","","第二节","补充例子",[],{writingOutline:"## 第二节\n## 第一节",nodeDescription:"先说明原因"});
    expect(messages.at(-1)!.content).toContain("当前写作大纲：\n## 第二节\n## 第一节");
    expect(messages.at(-1)!.content).toContain("节点写作描述：先说明原因");
    expect(messages.at(-1)!.content).toContain("不重复标题");
  });
});
