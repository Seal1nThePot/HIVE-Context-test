# outline — 写作大纲与标题目录

两个面板共用一套「文档 → 结构」的读取：**写作大纲**（`WritingOutlineV2`，可编辑的节点树）与**标题目录**（`TableOfContentsPanel`，只读跳转）。

## 文件

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `WritingOutlineV2.tsx` | 408 | 写作大纲面板：节点树渲染、增删改、上移/下移排序（`moveWritingNode(nodes, id, ±1)`）、与正文标题联动 |
| `writingNodes.ts` | 61 | 节点模型：`WritingNode`、`headingKey`、`targetForNode`（节点 → 正文位置）、`initialWritingNodes`、`moveWritingNode` |
| `useWritingNodes.ts` | 120 | 载入/保存 `/api/writing-outline`（带 revision）、与正文标题同步 |
| `TableOfContentsPanel.tsx` | 20 | 标题目录面板（点击跳转） |
| `tocModel.ts` | 15 | `tocRows`：`Heading[]` → 缩进层级行 |
| `table-of-contents.css` | 20 | 样式 |

## 想改 X → 改哪里

| 想改 | 改这里 |
| --- | --- |
| 大纲节点怎么对应正文 | `writingNodes.ts` 的 `headingKey` / `targetForNode` |
| 调整节点顺序 | `writingNodes.ts` 的 `moveWritingNode(nodes, id, ±1)`；按钮在 `WritingOutlineV2.tsx` 第 199 / 209 行 |
| 保存冲突 | `useWritingNodes.ts` + `server/writing-nodes.mjs`（revision 409） |
| 目录层级样式 | `tocModel.ts` + `table-of-contents.css` |

## 不变量 / 坑

- 标题是唯一锚点：节点靠 `headingKey` 绑到标题，改标题文本会让绑定失效，必须走 `headingKey` 的规范化逻辑。
- 大纲保存是「整棵替换 + revision 校验」，不要做增量 patch。
- 正文标题由 `shared/core.ts` 的 `headings()` 解析，两个面板都读它，不要各写一套。

## 验证

- `writingOutline.test.ts` — 节点与标题绑定、移动
- `tocModel.test.ts` — 目录层级