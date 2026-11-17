# scratch — 自由草稿

独立于文档树的临时写作区，固定落在 `自由草稿.md`（`/api/scratch`）。它复用 `editor/Editor` 的 `makeState`，但保存链、标注源（`source: scratch`）都是自己的一套。

## 文件

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `ScratchPad.tsx` | 253 | 草稿面板：编辑器实例、自动保存（`/api/scratch` + baseline）、另存为文档、标注、查找、焦点切换。面板关闭时销毁 `EditorView` 但保留 `state` 与滚动位置，重开 `setState` 复原（历史与撤销都还在） |

## 想改 X → 改哪里

| 想改 | 改这里 |
| --- | --- |
| 草稿保存逻辑 | `ScratchPad.tsx` 内的保存 effect（服务端 `server/index.mjs` 的 `/api/scratch`） |
| 草稿 → 文档 | `ScratchPad.tsx` 的另存为回调（走 `useFileActions` 的 `openSaveAs`） |
| 草稿上的标注 | `activeTextSource = scratch`，标注层在 `annotations/` |

## 不变量 / 坑

- 草稿只有一份，路径固定；不要给它加多标签。
- `onEditor(view, save)` 会把 view 与保存函数一起交给 App，`scratchView` / `scratchReady` 是它的渲染信号。
- 草稿保存也用 `baseline` 冲突闸，和正文一致。
- 关闭面板 ≠ 丢内容：`onReady(null)` 先把 `view.state` 存进 `state.current` 再销毁视图，重开时内容 hash 未变就复用同一个 `EditorState`；不要改成每次重建，否则撤销历史与滚动位置会没。

## 验证

- 无独立测试；服务端 `/api/scratch` 在 `server/workspace.test.mjs` 覆盖。