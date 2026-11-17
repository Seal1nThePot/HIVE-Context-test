# files — 文档栏、保存链、工作区上下文

左边文档栏 + 「文档怎么从磁盘进到编辑器、又怎么写回去」。两条链要分清：**结构操作**（新建/改名/移动/删除，走 `useFileActions`）与**内容持久化**（自动保存/冲突/外部改动，走 `useDocumentPersistence`）。

## 文件

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `useFileActions.ts` | 407 | app 层文件动作：`refresh` / `showFile` / `openFile` / `safeSwitch` / `openSaveAs` / `save` / `openBlankTab` / `openInLanding` / `createInLanding` / `openExplorerFile` / `manageFile` / `reloadFromDisk` / `switchWorkspace` / `submitDialog` / `importFile`。依赖通过一个 options 对象注入（ref 按引用传） |
| `useDocumentPersistence.ts` | 172 | 内容持久化：自动保存节流、`saveSession`、`applyDiskFile`、冲突判定、`savingPaths` / `fileConflicts`；每 2 秒的 `/api/workspace/sync` 轮询（`syncLatest`，`syncRunning` 单飞），只把 `path→hash` 的 baselines 发上去 |
| `FileExplorer.tsx` | 166 | 文档栏树：展开/折叠、排序、右键菜单、拖拽移动、内联改名 |
| `explorerState.ts` | 50 | 树状态纯函数：`Entry`、`sortEntries` / `sortDirection`、`menuActions`、`reorderEntry` / `remapOrder` / `readOrder`、`parentPath` / `mapEntryPath` |
| `fileSync.ts` | 7 | `diskSyncDecision`：磁盘变了要不要推进编辑器（编辑器干净才推） |
| `FilePicker.tsx` | 29 | 选择文件对话框（另存为/导入） |
| `TrashPanel.tsx` | 54 | 回收站面板：列表、预览清理（`TrashPreview`）、执行清理（`TrashPurgeResult`） |
| `WorkspaceContext.tsx` | 21 | `WorkspaceProvider` / `useFileWorkspace`：`/api/workspace` 的 `{id,root,autoSave,revision}` |
| `WorkspaceSettings.tsx` | 18 | 工作区设置：根目录、自动保存开关 |
| CSS | — | `file-explorer` / `file-picker` / `files` / `trash-panel` |

## 两条链

1. **打开**：`openFile(path)` → `/api/file` → 建/复用 `EditorSession`（`disk` + `state`）→ `workspace.openDocumentTab` → `showFile` 同步顶栏 `file`/`dirty`。
2. **保存**：`onUpdate` 改 `session.dirty` → `useDocumentPersistence` 按节流调 `/api/file`，带 `baseline`（原 sha256）；409 时进 `fileConflicts`，由 UI 让用户选择覆盖或重载。
3. **外部改动**：`syncLatest` 每 2 秒调 `/api/workspace/sync`，请求体带 `paths` 与 `baselines`（已知 hash）。服务端对 hash 相同的文件只回 `{path,hash,unchanged:true}` 不带正文，最多 4 个并发读；前端再按 `diskSyncDecision` 决定是否推进编辑器。

## 想改 X → 改哪里

| 想改 | 改这里 |
| --- | --- |
| 自动保存间隔 | `useDocumentPersistence.ts` 的节流常量 |
| 保存冲突提示 | `useDocumentPersistence.ts` + `server/files.mjs`（baseline 校验） |
| 同步轮询的频率/并发 | 前端 `useDocumentPersistence.ts` 的 2 秒定时器；并发与 `unchanged` 判定在 `server/index.mjs` 的 `/api/workspace/sync`（`Math.min(4, …)`）与 `server/files.mjs` 的 `read(relative, knownHash)` |
| 文档栏排序/右键菜单 | `explorerState.ts` 的 `sortEntries` / `menuActions` |
| 改名/移动后标注跟着走 | 服务端 `remapMetadata`；前端 `mapEntryPath` 更新打开中的会话 |
| 回收站清理天数 | `TrashPanel.tsx` + `server/trash-retention.mjs`（只接受 7/15/30/90） |

## 不变量 / 坑

- `sessions` 是 `Map`，`useFileActions` 拿到的是 ref，**不要解构值**，否则切页后拿到旧会话。
- 保存必须带 `baseline`，服务端写入前会再读一次；不要为了「绕过冲突」去掉它。
- `file`（顶栏路径）与 `dirty` 是渲染投影，真值在 `session.disk` / `session.dirty`。
- 结构操作会同时动「文件系统 + 标注/大纲元数据 + 打开中的会话」，三处要一起改。

## 验证

- `explorerState.test.ts` — 排序与路径映射
- `fileSync.test.ts` — 磁盘同步决策
- 服务端：`server/workspace.test.mjs`、`server/explorer.test.mjs`、`server/integration.test.mjs`