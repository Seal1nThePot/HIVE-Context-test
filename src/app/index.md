# src/app 目录索引

> 本文件描述 `src/app/` 当前的真实结构（2026-11-16 22:05，桌面外壳与独立面板落地后）。行号只是导航锚点，行号漂移时按符号名搜索。

## 这个目录是什么

应用外壳层：把 `features/*` 里的能力装配成一个可运行的工作台。它自己几乎不含业务规则——业务在 `features/`，纯规则在 `shared/core.ts`，落盘在 `server/`，窗口与进程在 `desktop/`。

## 文件清单

| 文件              | 行数    | 职责                                                                                        | 什么时候动它                 |
| --------------- | ----- | ----------------------------------------------------------------------------------------- | ---------------------- |
| `App.tsx`       | 1043 | 状态装配（ref 群 + useState + effect + 键盘快捷键）、退出协议、独立面板宿主与工作台布局 JSX                                  | 加全局状态、改布局、改跨模块编排       |
| `AppHeader.tsx` | 126 | 顶栏：写作空间菜单、保存/自动保存、另存为、模型切换、面板切换器、使用指南、工作区锁定、设置入口；桌面版右上角另有 `.header-window-controls`（最小化/最大化还原/保存并退出） | 改顶栏按钮、改面板切换器条目、改窗口按钮 |
| `api.ts`        | 7     | `requestApi`：在共享 `requestJson` 外面套一层响应兼容（`/config`、`/model-services` 走 `normalizeConfig`） | 加响应规范化、改接口前缀           |
| `api.test.ts`   | 18 | 验证 `/config` 归一化与其它路由原样透传                                                                 | 改 `api.ts`             |
| `styles.css`    | 2242 | 全局样式栈第一层（占全部 CSS 的 60%），被 `App.tsx` 顶部 import，后续 feature CSS 靠层叠覆盖它                       | 改全局外观；拆分时要保持 import 顺序 |

## App.tsx 内部地图

### 一、引导（116–123）

`App`（118）读 `/api/workspace`（120 的 effect），拿到写作空间信息后包一层 `WorkspaceProvider`（`key={info.id}`，换空间即重建），里面再套 `DesktopPanelsProvider`（122），最后挂 `WritingApp`。加载中/失败的重试 UI 也在这里。

`WritingApp`（124）才是工作台本体：`useDesktopPanels()`（125）→ `useFileWorkspace()`（128）→ `requestApi`（129）→ 各 `use*` 偏好 hook → 状态装配。任何业务都别往 `App` 这层塞。

### 二、状态装配（124–240）

| 锚点                                                                       | 内容                                                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `desktopPanels` 125                                                     | 独立面板注册表：`enabled`、`windows`（面板 id → 子窗）、`attach` / `detach` / `isComposing` / `returnAll` / `focus` |
| `closing` 126 / `closingWindow` 127                                     | 退出流程的互斥标记与全屏遮罩（`body.inert` 之外的第二道闸）                                                |
| `fileWorkspace` 128 / `request` 129                                     | 写作空间信息与 HTTP 出口                                                                      |
| `switching` 131 / `structuring` 131                                     | 「正在切空间」「正在做结构操作」的互斥 ref，退出前必须为 false                                                 |
| `statusPreferences` 130 / `appearanceSettings` 134 / `annotationPreferences` 135 / `panelIconDragPreferences` 136 | 四类界面偏好（桌面版由 preload 落成 `ui-preferences.json`）                                     |
| `workbenchRef` / `workspace` 137                                        | 舞台根节点与面板几何；第三个参数是 `28*uiScale/100` 的图标条宽度                                            |
| `sessions` 138                                                          | **会话表**（`Map<string, EditorSession>`）；键 `editor` 是主文档，`editor:<uuid>` 是附加标签页           |
| `filePickerTarget` 139 / `creatingNote` 140 / `activeSession` 141 / `syncingSessions` 141 / `activeEditorId` 142 | 文件选择、新建中、当前会话、同步单飞、当前编辑区 id                                                       |
| `sessionCallbacks` 143 / `sessionBindings` 144 / `bindings()` 145      | CodeMirror 回调按 session 分发：`bindings(id).onUpdate` 是每个编辑区的唯一入口                        |
| `editorIds` 149                                                         | `[...sessions.current.keys()]`，标签顺序即渲染顺序                                             |
| `panelLabel()` 150                                                      | 面板标题（文件名 / 新标签页 / 面板名 / 回收站）                                                        |
| `leftPanel` / `rightPanel` 154 / `leftOpen` / `chatOpen` 155 / `setChatOpen` 156 | 左右侧栏句柄                                                                              |
| `editorState` / `view` / `scratchView` / `orbPosition` / `generation` / `running` 157–172 | 主文档 EditorState、两个 EditorView、悬浮球尺寸、生成代次与在跑标记                                     |
| `entries` 173 / `scratchReady` 178 / `annotationTool` 179 / `chatTab` 186 / `outline` 192 / `filter` 195 / `writingNodeId` 196 / `mode` 199 / `currentMode` 205 / `config` 207 / `dialog` 211 / `fileBusy` 215 / `help` 214 | 主要 state 群                                                                    |
| `references` 220 / `reasoning` 221                                      | 参考资料与推理强度（按服务/模型分键）                                                              |
| `annotations` 223 / `writingOutline` 233                                | 标注与写作节点                                                                              |
| `redraw()` 234                                                          | **唯一重绘信号**：ref 里的值改了，必须 `redraw()` 才会反映到界面                                           |
| `captureView` / `applyView` 235                                         | 视图快照存取                                                                               |
| `chrome` 240                                                            | `PanelChrome` 上下文，透传给每个 `PanelFrame`                                               |

### 三、跨模块编排（241–575）

| 锚点 | 做什么 |
| --- | --- |
| `useDocumentPersistence` 246 | 900ms 自动保存 + 2s 磁盘同步；返回 `savingPaths` / `fileConflicts` / `saveSession` / `applyDiskFile` |
| `onUpdate` 247 | 每次按键：更新 `editorState`、重算大纲与选区、把改动交给标注层与持久化层 |
| `onScratchEditor` 274 / `onScratchUpdate` 279 | 草稿纸的挂载与更新 |
| `ribbonCommand` 284 | 顶部编辑栏命令 → `runEditorCommand`（289） |
| `activateEditor` 320 / `closeEditor` 339 / `minimizeEditor` 345 | 编辑区会话的激活、关闭、收纳；关闭/收纳前先 `desktopPanels.attach(id)` 把面板从独立窗口搬回（失败即中止），再把 `view.state` 与 `scrollDOM.scrollTop` 存回 session；激活时用 `requestAnimationFrame` 还原 |
| `useFileActions(...)` 352 | 文件动作集合（打开/另存/新建/导入/整理文件/切换空间/对话框）全部来自 `features/files/useFileActions.ts` |
| `stop` 355 | 停止生成（2 行，委托 `stopWritingGeneration`） |
| `chooseSidebar` 399 | 左栏切换（files / outline / scratch） |
| 十二个 effect 180 / 206 / 358 / 394 / 402 / 406 / 416 / 448 / 449 / 450 / 475 / 482 | Esc 关标注浮层（遍历所有 document）、appAlive、首屏载入文档、notice 定时清除、滚动到底、`beforeunload`、**多窗口快捷键**、服务停止提示、切空间/退出前的组词拦截、**桌面退出协议**、退出期输入封锁、全局弹窗把主窗拉到前面 |
| `openSettings` 484 / `updateSettings` 485 / `selectChatModel` 490 | 设置页与模型切换 |
| `chooseMode` 496 / `openChat` 502 | 对话面板的打开与浮窗定位 |
| `locate` 533 / `currentHeading` 543 / `currentWritingNode` 544 | 定位与生成锚点 |
| `generate` 553 | 组装 `generateWriting` 的入参（文档/模型/会话/生命周期/参考/UI 六组），本身不含逻辑 |
| `accept` / `reject` / `undoAI` 563 | `createProposalActions` 的产物 |
| `iconRail` 566 | 左右边缘图标栏 |

#### 多窗口与退出（桌面版专有，Web 下是空操作）

- **快捷键挂到所有 document**：443–445 行取 `[window, ...desktopPanels.windows.values()]` 逐个绑 `keydown`，所以子窗里 Ctrl+S / Ctrl+F / Ctrl+J 一样生效；`document` 从 `event.target.ownerDocument` 取（418）。**Esc 单独一条**：180–185 行把「关标注浮层」的 `keydown` 也挂到 `[document, ...子窗 document]`，依赖 `desktopPanels.windows`。两条 effect 的依赖都是「每次渲染重绑」，`windows` 变了自然跟上。
- **退出协议**（450–473）：主进程发 `hive:close-requested` → 所有 document `body.inert=true` + 置 `closingWindow` → 校验（生成中 / 切空间中 / 组词中 / 保存中）→ `fileWorkspace.flush()` + 逐会话 `saveSession(id, true)` → `hiveDesktop.finishClose(true)`；20s 超时或保存失败 → `finishClose(false)`，窗口和内容都保留。
- **退出期封锁**（475–481）：给每个 document 绑 `beforeinput` / `keydown` / `paste` / `drop` 的捕获拦截，并渲染 `.desktop-closing` 遮罩，防止在保存窗口里继续改稿。
- **无边框窗口**：主窗与子窗都 `frame:false`，拖拽区由 CSS `-webkit-app-region:drag` 提供（顶栏、子窗面板标题栏），按钮设 `no-drag`；窗口按钮统一走 `window.hiveDesktop.windowCommand`。主窗右上角三键在 `AppHeader.tsx`（`.header-window-controls`，第三个「保存并退出」走 `windowCommand('close')` → 同一条退出协议）；子窗标题栏菜单只有最小化与「关闭窗口并移回主窗口」，**子窗不可最大化**（主进程 `maximizable:false` + `commandAllowed` 拒绝 + `maximize` 事件强制还原）。
- **窗口唤醒**：主进程 `second-instance` / `activate` / 主窗 `focus` → `showAllWindows()`，恢复主窗与所有已 `panelReady` 的子窗并前置；未就绪子窗不显示。
- **全局弹窗留在主窗**：设置、帮助、文件选择、通用对话框都渲染在主窗；482 行一旦它们打开就 `window.focus()`，把主窗拉到前面。
- **服务停止**（448）：`onServiceError` 只提示「本地服务已停止。未保存内容仍保留在窗口中，请导出或复制备份后重新启动。」，不自动退出。

### 四、布局 JSX（576–1043）

| 锚点 | 区域 |
| --- | --- |
| 578 | `<AppHeader>` 顶栏 |
| 583 | `<Ribbon>` 顶部编辑栏 + 视图控件 |
| 588 | `.workbench-host` 舞台根 |
| 590 / 860 | `iconRail('left')` / `iconRail('right')` 边缘图标栏 |
| 592 | `<DesktopPanel id="files">` 包住文档栏 `<aside>`（`FileExplorer` 615）+ 导入 input + 回收站底栏 + 拖拽手柄 |
| 633 | `editorIds.map`：每个编辑区一个 `<DesktopPanel>`（635），内含标签头、冲突条、`NewTabPage` 或 `<Editor>`（669，挂载条件 `id==='editor' || workspace.isOpen(id)`）、状态栏 |
| 733 | `<DesktopPanel id="conversation">` 对话栏 |
| 794–853 | 侧面板 `<PanelFrame>`：toc 794 / outline 795 / scratch 819 / annotations 837 / basis 851 / trash 852 / search 853 |
| 864 | `<FloatingOrb>` 悬浮球 |
| 873 | 行内标注编辑浮窗：按 `[['main', document], ...desktopPanels.windows]` 给每个 document 各渲染一份 |
| 886 | `<WritingDock>` 浮动写作工具条 |
| 889 | 提示条 `notice` |
| 903 | `<SettingsPage>` 设置页 |
| 905 | `<FilePicker>` 选择文件 |
| 907/908 | 插入图片/表格对话框；文件夹/重命名/另存为等通用对话框 |
| 959 | 确认框 `confirm` |
| 985 | 使用指南 `help` |

## 想改什么 → 改哪里

| 需求 | 去处 |
| --- | --- |
| 加一个全局状态 / 一个新的跨面板动作 | `App.tsx` 状态装配区 + 编排区；改完确认调用了 `redraw()` |
| 顶栏按钮、面板切换器条目 | `AppHeader.tsx` |
| 面板外框、标题栏按钮、`nativeWindowActions` | `features/workspace/PanelFrame.tsx` |
| 面板移出/移回独立窗口 | `features/workspace/DesktopPanels.tsx`（宿主在本层 122 挂载） |
| 桌面版退出流程 / 保存等待 | `App.tsx` 450–481 + `desktop/main.mjs` 的 close 协议 |
| 打开/另存/导入/整理文件 | `features/files/useFileActions.ts` |
| 视图快照（保存/恢复布局） | `features/workspace/useViewSnapshots.ts` |
| 标注标记/定位/送对话 | `features/annotations/useAnnotationActions.ts` |
| 生成请求怎么拼、SSE 怎么解析 | `features/chat/writingGeneration.ts` |
| 接口响应归一化 | `api.ts` |

## 不变量（改这里时必须守住）

1. **ref 按引用传**：`sessions` / `view` / `disk` / `proposal` / `undo` / `controller` / `running` 一旦被复制成普通变量，闭包拿到旧值，保存与生成链会静默错位。
2. **`tick` 是唯一重绘信号**：ref 变了不调 `redraw()`，界面就不刷新。
3. **会话键约定**：`editor` 是主文档（不可关闭），`editor:<uuid>` 是附加标签页；`sessions.current` 与 `workspace` 的打开列表必须同时维护。
4. **`App.tsx` 顶部 import 顺序即 CSS 层叠顺序**：`styles.css` 必须最先，feature CSS 在其后。
5. **每个编辑区必须走 `bindings(id)`**：直接给 `<Editor>` 传回调会让多标签页串台。
6. **关闭/收纳面板要卸载 `EditorView`**：`<Editor>` 只在 `id==='editor' || workspace.isOpen(id)` 时挂载（669），面板一关视图就销毁；所以 `closeEditor` / `minimizeEditor` 必须先把 `view.state` 与 `scrollDOM.scrollTop` 写回 session（`restoreScroll`），重开时再由 `activateEditor` 用 `requestAnimationFrame` 还原。少了这一步，内容虽在（`session.state` 还在），撤销历史与滚动位置会丢。
7. **新增全局快捷键必须挂到所有 document**：只绑父窗 `window` 的话，面板移出成独立窗口后快捷键就失效。写法照 443–445：遍历 `[window, ...desktopPanels.windows.values()]`，`event.target.ownerDocument` 取所属文档。
8. **退出期不许再有写入**：`closing.current` 一旦为 true，任何保存/生成/切空间都必须早退；`body.inert` 只是遮罩，不能替代代码里的判断。
9. **独立面板的 DOM 只能经 `DesktopPanel` 搬**：`PanelFrame` 的 `<aside>` 在 `#root` 里，直接 `appendChild` 到子窗会丢 React 事件委托；搬的是 portal 容器（`.desktop-panel-surface`）。

## 验证方式

- 类型：`npx tsc --noEmit`
- 测试：`npx vitest run`（当前 47 文件 / 405 项；`api.test.ts` 是唯一覆盖本目录的测试）
- 构建：`npm run build`
- 桌面：`npm run desktop`（先 build）或 `npm run desktop:dev`
- `App.tsx` 没有专属测试：改布局或状态装配后必须手动过一遍 保存 / 生成 / 切换面板 / 另存为 四条链路；改桌面相关还要过 面板移出→移回→关子窗 / 子窗里 Ctrl+S / 退出时保存等待 三条。
