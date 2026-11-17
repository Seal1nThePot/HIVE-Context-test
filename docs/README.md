# HIVE 桌面版 · 代码指示文档

> 这些文件只描述**当前代码的真实状态**，用于快速定位与安全改动。不写计划、不写历史。
> 当前交付：0.1.2，2026-11-17 完整测试 65 文件 / 533 项通过，生产构建通过。新增性能与文件生命周期模块见 [性能记录](performance-0.1.2.md)，版本变更见 [维护记录](record/版本维护记录.md)。
>
> 下方详细目录地图源于 2026-11-16 的 0.1.0 审计；行号、行数和当时测试计数是历史定位参考，可能随本轮修改变化，以实际源码和上述当前记录为准。

## 文件索引

| 文件 | 回答什么问题 | 什么时候必须同步更新 |
| --- | --- | --- |
| [architecture.md](architecture.md) | 系统由哪几层组成、一次 AI 生成的数据怎么流动、状态存在哪里 | 新增/删除模块、改数据落盘位置、改生成链路 |
| [backend-contract.md](backend-contract.md) | 后端有哪些接口、请求/响应与错误约定、并发冲突怎么防 | 增删路由、改请求体字段、改冲突策略 |
| [frontend-map.md](frontend-map.md) | App.tsx 里哪段代码管什么、保存/同步/生成/标注/大纲各自的不变量 | 改 `src/app/App.tsx` 或 `src/features/*` 的主流程 |
| [workspace-ui.md](workspace-ui.md) | 面板布局（停靠/浮动/标签页/视图预设）的数据结构与改动方式 | 改 `src/features/workspace/*` |
| [../src/app/index.md](../src/app/index.md) | `src/app/` 里每个文件管什么、App.tsx 内部地图、想改 X 改哪里 | 改 `src/app/*` |
| [../src/features/*/index.md](../src/features/) | 每个 feature 目录一个：文件表（行数/职责）、想改 X 改哪里、不变量与坑、验证 | 增删该目录文件、改其主流程或对外契约 |
| [performance-0.1.2.md](performance-0.1.2.md) | 当前性能代码、原因、内存口径和验收限制 | 改后台休眠、解析、统计、文件生命周期或性能边界 |
| [record/版本维护记录.md](record/版本维护记录.md) | 已交付版本的维护记录 | 交付版本功能、修复和验证结果 |
| [runbook.md](runbook.md) | 怎么启动、怎么测、怎么隔离验证、有哪些已知坑 | 改端口、脚本、环境变量、构建方式 |
| [packaging.md](packaging.md) | 桌面外壳怎么起、IPC 协议、窗口与导航策略、独立面板窗、退出与偏好、怎么打包 | 改 `desktop/*`、改启动参数、改退出流程、改打包配置 |
| [../desktop/](../desktop/) | Electron 主进程（`main.mjs`）、preload 桥（`preload.cjs`）、偏好白名单（`preferences.cjs`） | 改窗口/进程/退出/IPC/偏好持久化 |
| [../scripts/](../scripts/) | 开发用启动脚本（`desktop-dev.mjs`：spawn electron，置 `HIVE_DESKTOP_DEV=1`） | 改本地开发启动方式 |

## App.tsx 拆分进度（进行中）

> 口径：只做物理搬迁，不重写逻辑、不换状态库、不改渲染模型；每一步 `npx tsc --noEmit` + `npx vitest run`（47 文件 / 405 项）+ `npm run build` 全绿才进下一步。
> 结果：`App.tsx` **1430 → 1004 行**（−30%），新增 5 个文件，行为零改动；内存优化阶段到 1006 行（关闭/收纳时卸载 `EditorView` 的捕获逻辑）；桌面阶段到 **1043 行**（多窗口快捷键、退出协议、`DesktopPanels` 宿主、标注浮窗按 document 渲染）。

### 已落地的新文件

```text
src/
├─ app/
│  ├─ App.tsx                 1043  状态装配 + 多窗口/退出编排 + 工作台布局（剩余：状态声明 + JSX 舞台）
│  └─ AppHeader.tsx            126  顶栏：写作空间、保存/自动保存、模型、面板切换器、帮助/锁定/设置 + 主窗三键
└─ features/
   ├─ workspace/
   │  ├─ PanelFrame.tsx          80  面板外框 + 面板标题栏按钮 + nativeWindowActions（主窗三键 / 子窗两项）
   │  ├─ DesktopPanels.tsx    186  面板移出/移回独立窗口（portal 容器搬移 + setRoot + 样式镜像）
   │  └─ useViewSnapshots.ts   151  captureView / applyView（视图快照存取）
   ├─ files/
   │  └─ useFileActions.ts     405  打开/另存/新建标签/导入/整理文件/切换写作空间/对话框提交
   └─ annotations/
      └─ useAnnotationActions.ts 128 标注：标记、取消、定位、重锚、送入对话
```

### 仍留在 App.tsx 的部分（下一轮候选）

| 现状（App.tsx 行） | 内容 | 建议去处 |
| --- | --- | --- |
| 118–246 | `App` 引导（118–123）+ `WritingApp` 的 ref 群与状态声明 | 会话相关 → `editor/useEditorSessions.ts` |
| 145–153 | `bindings` / `editorIds` / `panelLabel` | `useEditorSessions` |
| 247–355 | `onUpdate` / `onScratchEditor` / `onScratchUpdate` / `ribbonCommand` / `activateEditor` / `closeEditor` / `minimizeEditor` / `stop` | 编排层留在 App；编辑区会话操作 → `useEditorSessions` |
| 358–482 | 十个 effect（358 首屏载入文档、394 notice 定时清除、402 对话滚动到底、406 `beforeunload`、416 多窗口快捷键、448 服务停止、449 切空间/退出前组词拦截、450 退出协议、475 退出期封锁、482 抢焦点；另有 180 Esc 关浮层、206 appAlive） | 多窗口与退出属于外壳职责，**不建议**下沉到 feature |
| 399–575 | `chooseSidebar`(399) / `openSettings`(484) / `updateSettings`(485) / `selectChatModel`(490) / `chooseMode`(496) / `openChat`(502) / `locate`(533) / `generate`(553) | `generate` 已只是 `chat/writingGeneration.ts` 的薄封装，不必再包一层 |
| 576–1043 | JSX：图标栏、文件栏、编辑区、对话栏、侧面板、浮层、设置 | `WorkbenchStage` / `EditorStage` / `ChatPanel` / `OverlayHost` |

### 已放弃的拆分（避免拆碎）

- `useGenerationRunner`：`generate` 只有 10 行、`stop` 只有 2 行，抽出来只多一层壳。
- `PanelControls.tsx` 独立成文件：与 `PanelFrame` 同属面板外框，放在同一文件里。

### 拆分时必须守住的三条

1. **ref 按引用传，不按值传**：`sessions` / `view` / `disk` / `proposal` / `undo` / `requestAnchor` / `controller` / `running` 一旦被复制成普通变量，闭包就会拿到旧值，保存与生成链会静默错位。
2. **`tick` 仍是唯一重绘信号**：搬迁期间不要顺手把 `redraw()` 换成别的机制；`setTick` 少调一次就是「界面不刷新」的 bug。
3. **`PanelFrame` / `PanelControls` 是翻译不是复制**：`ref`、`style`、`data-panel-id`、`data-lock-panel`、`data-position-locked`、`onPointerDownCapture`、`panel.handles`、`id!=="scratch"` 的底栏条件、标签组 `groupMembers` 分支，缺一项就坏一处交互。

### 本轮不动的部分

- `server/`（Express 与各 store）、`shared/core.ts`（建议规则）、`desktop/`、`features` 下其余既有文件。
- 所有 CSS：`styles.css` 2242 行占 60%，另开一轮按 tokens / shell / editor / panels / dialogs 切，且必须保持 `App.tsx` 顶部 import 顺序。
- 性能优化（`markdownDisplay` 装饰重建、`headings` 全文解析、2 秒同步 sha256）：等拆分完成后单独做，避免和搬迁混在一起。


## 上游权威文档（本目录之外的单一事实源）

- `prototype/agent.md`：交付形态、界面交互规则、数据保护原则、后续边界——**规则类冲突以它为准**。
- `prototype/VALIDATION.md`：历次验证记录与截图证据索引。
- `prototype/README.md`：面向使用者的操作说明。
- 仓库根 `2026-11-1*.md`：产品讨论与第一版功能/技术方案（设计意图来源）。

## 维护约定

1. 改代码前先读对应文档；改完代码后，若触及「什么时候必须同步更新」列出的内容，同一次改动里更新该文件。
2. 文档里的行号（如 `App.tsx:758`）只作**导航锚点**，优先用函数名/导出名搜索；行号漂移时以符号名为准并顺手更新。
3. 只写现状。方案取舍写进 `agent.md`，验证证据写进 `VALIDATION.md`，不要在这里堆过程。
4. 新增模块时，在 `architecture.md` 的分层表里加一行，并在对应专题文档里补一节「改哪里」。
5. 本文件的「App.tsx 拆分进度」是**唯一允许写计划的地方**；每完成一步就同步更新「已落地的新文件」与「仍留在 App.tsx 的部分」两张表。
6. `src/features/` 下每个目录都有自己的 `index.md`（annotations / chat / editor / files / outline / ribbon / scratch / settings / workspace）：增删文件或改主流程时同一次改动里更新它，行数漂移只需改表里的数字。
