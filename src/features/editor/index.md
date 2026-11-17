# editor — CodeMirror 编辑器与文档内功能

一个编辑页 = 一个 `EditorState` + 一个 `EditorView`（见 `editorSessionTypes.ts`）。本目录放「文档内部」的一切：扩展装配、显示模式、表格、笔记属性、格式化、查找、状态栏、打字机。

## 文件

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `Editor.tsx` | 235 | 编辑器组件 + `makeState`：装配扩展（markdown、历史、搜索、括号、显示模式、标注、打字机）、keymap、右键菜单、标注工具 |
| `editorSessionTypes.ts` | 26 | `EditorSession`：一页的全部状态（disk/state/view/dirty/显示设置/context） |
| `editorDialogTypes.ts` | 7 | `Dialog` 联合类型（插入图片/表格等） |
| `markdownDisplay.ts` | 91 | 显示模式 `live`/`source`：`setDisplayMode`、`displayModeField`、`markdownPreview`、预览 widget（图片/表格/属性/分隔线）、`configureImageContext` |
| `markdownPresentation.ts` | 118 | 预览替换计划：`previewPlan` 决定哪些区间渲染成什么（`PreviewReplacement`）；表格单元格在这里就切成 `PreviewCell{from,to,text,virtual?}` 并带上 `text`，`visibleReplacements` 只取视口内的 |
| `tableWidget.ts` | 80 | 表格 widget：`TableWidget`、`tableRectangle`、单元格 `decodeCell` / `encodeCell` / `cellContent`、`tableSizeKey`。取单元格文本走 `cellContent(cell, doc)`：传 `Text` 时用 `doc.sliceString(from,to)` 只读那一段，不把整篇文档转成字符串 |
| `noteProperties.ts` | 95 | 笔记属性（frontmatter）：`readNoteProperties`、`notePropertiesChange`、`notePropertiesTransaction`、`PropertyType` |
| `NotePropertiesDialog.tsx` | 56 | 属性编辑对话框 |
| `formatting.ts` | 160 | 格式检查与插入：`inspectFormatting`、`inlineFormatting`、`paragraphAlignment`、`lineFormatting`、`insertStructure` |
| `insertions.ts` | 33 | 插入图片/表格：`insertImage`、`insertTable`、`imageMarkdown`、`localImageUrl` |
| `searchTools.ts` | 33 | 查找扩展：`makeSearchQuery`、`floatingSearchExtensions`、`configureFloatingSearch`、`searchMatches` |
| `FindReplacePanel.tsx` | 30 | 查找替换面板 |
| `statusModel.ts` | 42 | 状态栏模型：`statusItems`、`textStatistics` / `documentStatistics`、`normalizeStatusOptions`、`placeStatusItem` |
| `EditorStatusBar.tsx` | 23 | 状态栏组件 + `useStatusPreferences` |
| `StatusBarSettings.tsx` | 59 | 状态栏项设置 |
| `typewriter.ts` | 37 | 打字机模式：`setTypewriter`、`typewriterEnabled`、`typewriterExtensions` |
| `DisplayModeControl.tsx` | 37 | 显示模式 / 打字机切换按钮 |
| `EditorContextMenu.tsx` | 86 | 右键菜单：`AnnotationContext`、`clipboardChange`、`decodedOffsets` |
| `EditorInsertDialog.tsx` | 39 | 插入对话框（图片/表格） |
| `NewTabPage.tsx` | 23 | 空标签页（新建/打开入口） |
| CSS | — | `display-mode` / `editor-context-menu` / `editor-tools` / `new-tab` / `note-properties` / `status-bar-settings` |

## 想改 X → 改哪里

| 想改 | 改这里 |
| --- | --- |
| 加一个 CodeMirror 扩展 | `Editor.tsx` 的 `makeState` |
| 快捷键 | `Editor.tsx` 的 keymap；工具条命令走 `ribbon/editorCommands.ts` |
| 预览里图片/表格长什么样 | `markdownDisplay.ts` 的 widget + `markdownPresentation.ts` 的 plan |
| 表格编辑行为 | `tableWidget.ts` |
| 字数/段落统计 | `statusModel.ts` 的 `textStatistics` |
| 属性面板 | `noteProperties.ts` + `NotePropertiesDialog.tsx` |

## 不变量 / 坑

- `makeState(text, bindings)` 是唯一建 state 的入口，不要绕过它 `new EditorState`，否则扩展与回调会缺失。
- `EditorSession.state` 必须留着：切页靠它保留撤销历史与光标。
- 显示模式是 StateField（`displayModeField`），改它要 dispatch effect，不能改组件 state。
- 预览装饰会整篇重建，大文档下这是性能热点（见 docs/architecture.md 的优化方向）。
- 表格里任何「取单元格内容」都走 `cellContent(cell, doc)`，把 `doc` 传成 `EditorState.doc`（`Text`）；传 `doc.toString()` 会让每个单元格展开一遍全文，是内存峰值的主要来源。
- 本目录文件多但都很薄；改之前先确认是否属于 `annotations/`（标注装饰）或 `chat/`（生成）。

## 验证

- `formatting.test.ts`、`insertions.test.ts`、`markdownDisplay.test.ts`、`noteProperties.test.ts`、`searchTools.test.ts`、`statusModel.test.ts`、`tableWidget.test.ts`、`typewriter.test.ts`、`EditorContextMenu.test.ts`、`annotation-context.test.ts`