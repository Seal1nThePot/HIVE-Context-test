# ribbon — 顶部工具条与编辑器命令

工具条只负责「发出命令」，不碰文档；命令到 CodeMirror 操作的映射集中在 `editorCommands.ts`。

## 文件

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `Ribbon.tsx` | 198 | 顶部工具条：按钮组、下拉、启用/禁用态；导出 `RibbonCommand` 联合类型 |
| `editorCommands.ts` | 42 | `runEditorCommand(command, view)`：把命令翻译成 CodeMirror 操作（加粗、标题、列表、表格、图片…） |
| `ribbon-display.css` | 48 | 样式 |

## 想改 X → 改哪里

| 想改 | 改这里 |
| --- | --- |
| 加一个按钮 | `Ribbon.tsx` 的按钮组 + `RibbonCommand` 加一个成员 + `runEditorCommand` 加分支 |
| 命令行为 | `editorCommands.ts`（格式化细节在 `editor/formatting.ts`） |

## 不变量 / 坑

- `RibbonCommand` 是前后端之外的第三种「契约」：`App.tsx` 的 `ribbonCommand` 与 `PanelFrame` 的动作都依赖它，改成员要全局搜。
- 工具条按钮的禁用态由当前 `EditorView` 状态决定，不要在 Ribbon 内部缓存。

## 验证

- 无独立测试；行为由 `editor/formatting.test.ts` 与手测覆盖。