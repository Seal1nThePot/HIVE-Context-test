# 前端地图（现状，2026-11-16 18:10）

`src/app/App.tsx` 1394 行，仍是全站装配点，但生成、传输、建议动作、持久化、参考资料、面板目录已抽成独立模块（见 §2）。行号只作导航锚点，以符号名为准。

## 1. 入口与样式装载

- `index.html` → `src/main.tsx`（8 行）→ `createRoot(...).render(<App />)`。
- `App`（App.tsx:116）：`fetch("/api/workspace")` 拿空间信息，失败给重试按钮；成功后 `<WorkspaceProvider key={info.id}>` 包住 `WritingApp`（:122）。
- CSS 顺序：`styles.css`(:11) → `annotations.css`(:12) → `workbench-v3.css`(:13) → `free-workspace.css`(:14) → `panel-chrome.css`(:15) → `files.css`(:25)。其余样式由组件各自 import（`settings.css`、`view-presets.css`、`editor-tools.css`、`file-explorer.css`、`panel-icon-rail.css`、`annotation-bubble.css`、`editor-context-menu.css`、`model-picker.css`、`input-basis.css`、`note-properties.css`、`trash-panel.css`、`panel-switcher.css`）。

## 2. 已抽出的模块（App.tsx 之外）

| 模块 | 行数 | 职责 | 主入口 |
| --- | --- | --- | --- |
| `features/chat/writingGeneration.ts` | 305 | 组装 `GenerationContext` → `makePrompt` → 传输 → `parseSuggestion` → 写 proposal | `generateWriting(context, options)`、`stopWritingGeneration(...)` |
| `features/chat/generationTransport.ts` | 124 | 演示模式造文本；真实模式读 SSE 并抛可读错误 | `generateDemoText`、`streamModelText` |
| `features/chat/proposalActions.ts` | 99 | 接受/驳回/撤销，全部经 `canApply` | `createProposalActions({...})` |
| `features/files/useDocumentPersistence.ts` | 164 | 900ms 自动保存、2s 磁盘同步、409 冲突记账 | `useDocumentPersistence({api, sessions, ...})` |
| `features/chat/referenceSources.ts` | 62 | 参考资料来源列表、预算截断、消息注入 | `useReferenceSources`、`fitReferenceMessages` |
| `features/chat/modelReasoning.ts` | 14 | 推理强度（按服务/模型分键存 localStorage） | `useModelReasoning`、`reasoningLevels` |
| `features/workspace/panelCatalog.ts` | 27 | 面板分类、搜索、分组 | `panelCategories`、`filterPanels`、`groupPanels` |
| `features/workspace/railHoldGesture.ts` | 20 | 图标轨道长按拖出面板 | `RAIL_HOLD_MS`、`RailHoldGesture`、`railDragTarget` |
| `features/workspace/panelLockGesture.ts` | 20 | 面板位置锁手势（双击 / 长按） | `PANEL_LOCK_HOLD_MS`、`PanelLockGestureTracker` |
| `app/api.ts` / `shared/api.ts` | 7 / 14 | `requestApi` 与 `ApiClient` 类型 | `requestApi`、`requestJson` |

## 3. App.tsx 锚点

| 行 | 符号 | 作用 |
| --- | --- | --- |
| 116 | `App` | 空间引导与错误重试 |
| 122 | `WritingApp` | 装配主体 |
| 123/124 | `useFileWorkspace()` / `api<T>()` | 传输出口 |
| 125–131 | `useStatusPreferences` / `useAppearance` / `useAnnotationPreferences` / `usePanelIconDragPreferences` | 四类界面偏好 |
| 132 | `usePanelWorkspace(workbenchRef, onActivate, 28*uiScale/100)` | 面板几何 |
| 133 | `sessions = useRef(Map)` | 编辑会话表，初始只有 `editor` |
| 140 | `bindings(id)` | 每个编辑区的 CodeMirror 回调绑定 |
| 145 | `panelLabel(id)` | 面板标题（含 `trash`） |
| 149–151 | `leftPanel` / `leftOpen` / `setChatOpen` | 左右侧栏便捷句柄 |
| 152–167 | `editorState` / `scratchView` / `activeTextSource` / `orbBounds` / `view` / `controller` / `promptRef` | 主要 ref |
| 168–213 | `entries` / `scratchReady` / `annotationTool` / `chatTab` / `outline` / `filter` / `writingNodeId` / `mode` / `config` / `dialog` / `fileBusy` | 主要 state |
| 214/215 | `useReferenceSources` / `useModelReasoning` | 参考资料与推理强度 |
| 217/224 | `useTextAnnotations` / `useWritingNodes` | 标注与写作节点 |
| 231 | `useDocumentPersistence` | 保存与同步（返回 `savingPaths`/`fileConflicts`/`saveSession`/`applyDiskFile`） |
| 232/259/264 | `onUpdate` / `onScratchEditor` / `onScratchUpdate` | 编辑器回调 |
| 269 | `ribbonCommand` | 功能区命令分发 |
| 305/324/328 | `activateEditor` / `closeEditor` / `minimizeEditor` | 编辑区生命周期 |
| 337 | `stop()` | 中止生成 |
| 340/391 | `showFile` / `safeSwitch` | 打开文档与切换拦截 |
| 399–485 | 四个 effect | 初始树加载、自动保存、2s 同步、快捷键 |
| 440 | `chooseSidebar` | 左栏切换 |
| 486/489/497/505/514 | `openSaveAs` / `openBlankTab` / `openInLanding` / `createInLanding` / `openExplorerFile` | 新标签页与落地页 |
| 527 | `manageFile(action)` | `/api/explorer` 的 UI 侧封装 |
| 556 | `reloadFromDisk` | 从磁盘重载 |
| 563 | `switchWorkspace(root)` | 切写作空间 |
| 575/582 | `captureView` / `applyView` | 视图快照 |
| 622/634/640 | `openSettings` / `chooseMode` / `openChat` | 设置与对话入口 |
| 671/680/684/698/705/717 | `markText` / `unmarkText` / `locateAnnotation` / `reanchorAnnotation` / `sendAnnotations` / `locate` | 标注交互 |
| 727/728 | `currentHeading` / `currentWritingNode` | 生成时的定位依据 |
| 737 | `generate(options?)` | 调 `generateWriting` |
| 747 | `createProposalActions` | 接受/驳回/撤销 |
| 750/792 | `submitDialog` / `importFile` | 对话框与本地导入 |
| 817/822/842 | `iconRail` / `panelControls` / `renderPanel` | 面板外壳与内容装配 |
| 854 | `return (...)` | JSX 起点（约 540 行） |

## 4. 会话与面板 id

- 固定面板：`files`、`conversation`、`outline`、`toc`、`scratch`、`annotations`、`basis`、`search`、`trash`。
- 编辑区：主区 `editor`，多开为 `editor:<uuid>`；`workspacePolicy.isEditorPanel()` 认定两者。
- `EditorSession`（`features/editor/editorSessionTypes.ts`）：`{id, disk, state, view, dirty, landing?, restoreScroll?, context?}`。
- 权威 id 集合在 `features/workspace/viewPresets.ts:40`；新增面板要同时改 `panelLabel`、`renderPanel`、`panelCatalog` 与这里。

## 5. 保存与磁盘同步（`useDocumentPersistence`）

1. CodeMirror 变化 → `onUpdate` → `setDirty` + `setTick`。
2. 900ms 后保存脏会话：`POST /api/file {path,text,baseline,eol,bom}`；409 时保留内存内容并写入 `fileConflicts`，界面提示而不丢稿。
3. 每 2s `POST /api/workspace/sync {paths}`，逐文件比较 baseline/本地文本与磁盘：`unchanged` | `adopt` | `conflict`。
4. 结构操作（新建/改名/移动/复制/回收站/还原/清理）走 `POST /api/explorer` 与 `/api/explorer/trash/*`。

## 6. 生成与建议生命周期

- `generateWriting` 收集 `GenerationContext`：文档（view/disk/file/outline/currentHeading/currentWritingNode）、模型（config/reasoningEffort）、对话（mode/prompt/messages）、生命周期 ref、参考资料、写作节点、UI 回调。
- `makePrompt()`（`shared/core.ts:199`）拼 system + 历史 + user；`basis` 面板用 `InputBasisRequest` 展示同一份内容。
- 传输：演示模式走 `generateDemoText`；真实模式 `streamModelText` 读 SSE（`chunk|done|error`）。
- `parseSuggestion(raw, mode, continuationLimit)`：`text` 1–30000 字、`reason` ≤1000、`continue` 必须恰好一段且 `visibleCount ≤ limit`。
- 通过后写 `proposal.current`，**不落盘**；`accept/reject/undoAI` 由 `createProposalActions` 提供，全部经 `canApply`。
- `mapAnchor`（`shared/core.ts`）在每次 `docChanged` 时重定位 proposal / requestAnchor / undo。

## 7. 编辑器能力（`features/editor`）

| 模块 | 要点 |
| --- | --- |
| `formatting.ts` | `inlineFormatting` / `paragraphAlignment` / `lineFormatting` / `insertStructure` / `inspectFormatting`，全部返回 `TransactionSpec` |
| `insertions.ts` | `insertImage` / `insertTable` / `imageMarkdown` / `localImageUrl` |
| `markdownDisplay.ts` | `DisplayMode = live\|source`、`configureMarkdownDisplay`、`configureImageContext` |
| `markdownPresentation.ts` | `previewPlan` / `visibleReplacements`（纯函数） |
| `tableWidget.ts` | 表格的 CodeMirror 控件与行列操作（78 行） |
| `noteProperties.ts` / `NotePropertiesDialog.tsx` | frontmatter 属性的读写与对话框 |
| `searchTools.ts` | `FindFields`、`makeSearchQuery`、`configureFloatingSearch`、`searchMatches` |
| `typewriter.ts` | `configureTypewriter`、`typewriterExtensions` |
| `statusModel.ts` | `statusItems`、`readStatusOptions`、`textStatistics`、`documentStatistics` |
| `EditorContextMenu.tsx` / `EditorInsertDialog.tsx` / `FindReplacePanel.tsx` / `DisplayModeControl.tsx` / `NewTabPage.tsx` / `StatusBarSettings.tsx` | 视图层组件 |

## 8. 文件浏览与回收站（`features/files`）

- `explorerState.ts`：`Entry`、`SortMode`、`ExplorerOrder`、`sortEntries`、`reorderEntry`、`remapOrder`、`readOrder`、`mapEntryPath`、`flattenEntries`。
- `FileExplorer.tsx`（163 行，压缩风格单行代码）：树渲染 + 右键/工具栏动作，通过 `onAction(action: FileAction)` 交给 App。
- `TrashPanel.tsx`：回收站列表；清理先 `previewTrash(days)` 拿 token，再 `purgeTrash(token)`。
- `FilePicker.tsx`：把文件打开到指定编辑区。
- `fileSync.ts`：`diskSyncDecision`（7 行判定）。

## 9. 面板层（`features/workspace`）

见 `workspace-ui.md`。要点：`panelLayout`（树与测量）、`workspaceState`（布局纯函数）、`dockInteraction`（拖拽意图）、`autoHide`（自动隐藏）、`workspacePolicy`（主编辑区/层号/可移动性）、`panelCatalog`（分类与搜索）、`railHoldGesture` / `panelLockGesture`（手势）、`usePanelWorkspace`（React 绑定）、`viewPresets`（快照校验）。

## 10. 其余面板

- `outline`：`WritingOutlineV2` + `useWritingNodes`（`/api/writing-outline`）；`TableOfContentsPanel` + `tocModel.tocRows`。
- `annotations`：`useTextAnnotations`（拉取/修订/重锚）、`useAnnotationTool`、`annotations.ts`、`AnnotationPanel`、`InlineAnnotationEditor`、`annotationDecorations`。
- `scratch`：`ScratchPad`（`/api/scratch`，固定 `自由草稿.md`）。
- `chat`：`WritingDock`、`ChatComposer`、`WritingModeControl`、`ModelPicker`、`InputBasisPanel`、`FloatingOrb`。
- `settings`：`SettingsPage`（分区 `workspace/appearance/features/writing/models/shortcuts`）、`useAppearance`、`useAnnotationPreferences`、`usePanelIconDragPreferences`、`modelConfig`、`AppearanceSettings`、`AnnotationSettings`、`StatusBarSettings`、`WorkspaceSettings`。
- `ribbon`：`Ribbon.tsx` + `editorCommands.ts`（命令表）。

## 11. 想改 → 改哪里

| 想改的东西 | 改哪里 | 同步更新 |
| --- | --- | --- |
| 生成模式或提示词规则 | `shared/core.ts` 的 `Mode`/`makePrompt`/`parseSuggestion` | `core.test.ts`、`agent.md` 第 5 节 |
| 生成编排（上下文/预算） | `chat/writingGeneration.ts` | `writingGeneration.test.ts` |
| SSE 解析与错误文案 | `chat/generationTransport.ts` | `generationTransport.test.ts` |
| 接受/驳回/撤销 | `chat/proposalActions.ts` + `core.ts` `canApply` | `core.test.ts` |
| 保存与冲突策略 | `files/useDocumentPersistence.ts` + `server/files.mjs` | `files.test.mjs`、`backend-contract.md` |
| 磁盘同步判定 | `features/files/fileSync.ts` | `fileSync.test.ts` |
| 文件树与回收站 | `FileExplorer.tsx` / `TrashPanel.tsx` + `server/explorer.mjs` | `explorer.test.mjs`、`trash-retention.test.mjs` |
| 参考资料预算 | `chat/referenceSources.ts` + `server/references.mjs` | `referenceSources.test.ts`、`references.test.mjs` |
| 图片插入与预览 | `editor/insertions.ts` + `server/images.mjs` | `images.test.mjs` |
| 格式化/表格/属性 | `editor/formatting.ts` / `tableWidget.ts` / `noteProperties.ts` | 各自 `.test.ts` |
| 标注交互/渲染 | `features/annotations/*` | `annotations.test.ts` |
| 大纲与目录 | `features/outline/*` | `writingOutline.test.ts`、`tocModel.test.ts` |
| 面板布局/停靠/自动隐藏 | `features/workspace/*` | 见 `workspace-ui.md` |
| 模型/服务配置 | `settings/modelConfig.ts` + `server/model-config.mjs` | `model-config.test.mjs` |

