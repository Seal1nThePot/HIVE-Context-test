# 工作台面板层（现状，2026-11-16）

面板层分五块：**纯数据**（`panelLayout` / `workspaceState` / `autoHide` / `workspacePolicy`）、**交互意图**（`dockInteraction` / `railHoldGesture` / `panelLockGesture`）、**目录元数据**（`panelCatalog`）、**React 绑定**（`usePanelWorkspace` / `useViewSnapshots`）、**组件**（`PanelFrame`（含 `PanelControls`）/ `PanelIconRail` / `RailEdgeHandle` / `PanelSwitcher` / `PanelControl` / `WorkspaceTabs` / `DockGuides` / `ViewControls`）。纯数据与手势层全部有测试，改逻辑先跑 `npm test`。

## 1. `panelLayout.ts` — 停靠树

```ts
type Rect = {x,y,width,height}
type DockEdge = "left"|"right"|"top"|"bottom"
type DockPlacementEdge = DockEdge | "center"
type PanelGroup = {type:"group"; id; panels:string[]; active:string}
type DockTree = {type:"panel"; panel} | PanelGroup | {type:"split"; id; axis:"x"|"y"; ratio; a:DockTree; b:DockTree}
```

`initialDockTree()` = 横向 split(.2, `files` | 横向 split(.68, `editor` | `conversation`))。

| 导出 | 说明 |
| --- | --- |
| `leaf(panel)` | 单面板节点 |
| `dockedPanels(tree)` | 树中所有面板 id（先序） |
| `removeDockPanel(tree,panel)` | 摘除并回收空分支 |
| `insertDockPanel(tree,panel,target,edge,splitId?)` | 相对 target 插到某条边 |
| `insertDockPanelAtRoot(tree,panel,edge,splitId?)` | 在整棵树的某条外边新建分栏 |
| `mergeDockPanel(tree,panel,target,groupId?)` | 与 target 合并成标签组 |
| `activateDockPanel(tree,panel)` | 切到该标签 |
| `resizeDockSplit(tree,id,ratio)` | 夹紧 `.12–.88` |
| `measureDockTree(tree,bounds,gap=5)` | → `{panels,dividers,groups}`（像素矩形，供渲染与拖拽判定） |
| `dockResizeEdges(tree,panel)` | 该面板可拖的边 → 分隔条 id |
| `restoreDockAnchor(tree,panel,ancestors?)` / `restoreDockPanel(tree,panel,anchor)` | 记录并复原被摘除处的祖先上下文，保证重开时回到原尺寸 |
| `PANEL_HEADER_HEIGHT = 28` | 面板标题栏高度（会乘以 uiScale） |

## 2. `workspaceState.ts` — 工作区布局

```ts
type WorkspaceLayout = {
  tree: DockTree|null; open: string[]; minimized: string[];
  rects: Record<string,Rect>; layers: Record<string,number>;
  floatingGroups: PanelGroup[]; restore: Record<string,DockRestoreAnchor>;
  autoHide?: Record<string,AutoHidePlacement>; autoHideActive?: string|null; locked?: boolean;
}
```

- `defaultWorkspace()`：`open: [files, editor, conversation]`。
- `completeWorkspace()`：给旧快照补 `minimized/floatingGroups/restore`。
- `detachWorkspacePanel` / `activateWorkspacePanel` / `placeWorkspacePanel(layout,id,target,edge,fallbackRect)` / `placeWorkspacePanelAtEdge(layout,id,edge)`。
- `placeWorkspacePanel` 的 `center`：target 已浮动则并入同一浮窗标签组；否则 `mergeDockPanel`。
- 任何"重新打开"路径都先 `releaseAutoHidePanel`，避免残留自动隐藏记录。

## 3. `autoHide.ts` — 收起到边缘图标

```ts
type AutoHidePlacement = {edge: DockEdge; offset: number; rect: Rect}
```

| 导出 | 行为 |
| --- | --- |
| `nearestPanelEdge(rect,bounds,docked=false)` | 按中心点选左右；docked 且贴边时按实际贴边侧 |
| `panelAutoHidePlacement(rect,bounds,docked?,edge?)` | 算出 `offset`（0–1）并把超宽面板压到 ≤380 或舞台宽 |
| `withAutoHideMetadata(layout,bounds)` | 给所有 minimized 但缺记录的面板补 placement；top/bottom 重新按左右归位 |
| `releaseAutoHidePanel` / `collapseAutoHidePanel` / `expandAutoHidePanel` | 移除记录 / 收起（从 open 移入 minimized）/ 展开（同一时刻只允许一个 `autoHideActive`） |
| `autoHidePanelRect(placement,bounds,anchor?)` | 贴边弹层矩形，优先用图标锚点位置 |
| `placeRailIcons(items,length,size,gap)` | → `{extent, positions}`，双向挤压避免图标重叠 |

## 4. `workspacePolicy.ts` — 规则集中处

- `PRIMARY_EDITOR = "editor"`；`isEditorPanel(id)` 认 `editor` 与 `editor:*`。
- `retainPrimaryEditor(layout)`：**主编辑区必须始终独立可见**——从自动隐藏、浮窗组里拉出来，若与其它面板同组则拆成 split(.75)，不在树里则重建。
- `canMovePanel`：主编辑区不可移动；`locked` 时停靠面板不可移动；编辑区仅当至少两个编辑区时才能动。
- `canPlacePanel(layout,id,target,edge)`：非编辑区不能以 `center` 落进含主编辑区的组；`locked` 时只允许并入浮窗。
- `panelLayers = {docked:1, tabs:3, floating:100, peek:1000}`；`rankedFloatingLayers(layers,raised?)` 把浮窗层号压成 `100+2n`（上限 350 档），避免旧视图层号压过控件。
- `openDockedPanel`：把面板以停靠方式打开（必要时先脱离浮窗/自动隐藏，再靠到主编辑区右侧）。
- `openContentsPanel`：首次打开目录优先并入 `files` 组，否则在左边缘新建。
- `fitPanelInStage(rect,bounds)`：夹进舞台。

## 5. `dockInteraction.ts` — 拖拽意图

常量：`GUIDE_PAUSE_MS=350`、`SPLIT_DWELL_MS=240`、`STACK_DWELL_MS=700`、`DOCK_POINTER_SLOP=8`。

`DockIntent.step(input)` → `DockFeedback {visible,target,guides,hover,ready,progress,blocked}`：停留才显示控件，进入后再停留才算"要停靠"，避免误触。舞台级 guides = 新建左/右/上/下栏；面板级 guides = 左/右/上/下分栏 + 合并标签。

## 6. `usePanelWorkspace.tsx` — React 绑定

`usePanelWorkspace(stageRef, onActivate?, headerHeight = 28)` 返回（`PanelChrome` 类型在 `PanelFrame.tsx` 里定义，是本 hook 返回值 + 会话表 + 面板标题/开关动作的组合）：`panel(id)`（ref/floating/movable/primary/canDock/autoHidden/peek 等）、`open`、`close`、`minimize`、`toggle`、`isOpen`、`isDockedRight`、`chrome`、`capture`、`restoreLayout`、`reset`、`openIds`、`minimizedIds`、`tabGroups`、`splitEditor`、`openDocumentTab`、`locked`、`toggleLocked` 等。

行为要点：

- 每次 `update` 都过 `completeWorkspace → withAutoHideMetadata → retainPrimaryEditor`，再用 `fit` 把矩形夹进舞台（`ResizeObserver` 跟踪舞台尺寸）。
- 建议尺寸：`scratch` 取编辑区尺寸，`editor` 650 宽，其它 380×520。
- 拖动超过 5px 才 `setPointerCapture`；`Escape` / `pointercancel` / 窗口失焦都回滚到拖动前布局。
- 浮窗拖动与缩放分别走 `resizeFloatingRect`、`fitFloatingRect`（`panelUiGeometry.ts`：最小 190×180、8px 边距）。

## 7. 组件

| 组件 | 职责 |
| --- | --- |
| `PanelControl` | 面板标题栏按钮：浮动/打开/关闭/最小化/折叠边；`primary` 时隐藏关闭，`movable=false` 时禁用拖拽 |
| `PanelSwitcher` | 「面板」下拉菜单（portal，键盘上下/Home/End，Escape 关闭）；按 `panelCatalog` 的分类分组、支持搜索；`fixed` 项（主编辑区）显示「（主版面）」并禁用 |
| `PanelFrame` | 停靠/浮动面板外框：`ref={panel.ref}`、`style={panel.style}`、`data-panel-id`、`onPointerDownCapture={panel.raise}`、标题栏（`data-lock-panel` / `data-position-locked` / `onPointerDown={panel.beginDrag}`）、`children`、非 `scratch` 的底栏、`panel.handles` |
| `PanelControls` | 面板标题栏按钮组：编辑区额外挂 `DisplayModeControl`（显示模式/打字机），`groupMembers` 时整组关闭/最小化，编辑区额外「插入笔记属性」「标题目录」动作 |
| `RailEdgeHandle` | 图标条边缘的拖拽把手，配合 `railHoldGesture` 判定长按拖出 |
| `PanelIconRail` | 舞台边缘的自动隐藏图标条，`PanelRailItem{id,label,offset,active,Icon,number}`，点击回调带锚点矩形 |
| `WorkspaceTabs` | 标签组渲染：`group/ style/ label/ onSelect/ onDrag/ handles/ controls/ onNewTab` |
| `DockGuides` | 渲染 `DockFeedback.guides` 与进度 |
| `ViewControls` | 视图预设的保存/切换 UI（配合 `useViewPresets`） |

## 8. `viewPresets.ts` — 快照校验

存储键 `hive.views.v1:<workspaceId>`，结构 `{version:1, views: ViewPreset[]}`；`ViewPreset = {id,name(1–80),mode,updatedAt(ISO),layout,editors[],activeEditor,appearance,statusItems,filter,collapsed,chatOrb,orbPosition?,orbBounds?}`。

限制：原始 JSON ≤2,000,000 字符、对象深度 ≤36、视图 ≤128、`open`/`minimized` ≤64、组内 `panels` 2–64、`ratio` `.12–.88`、编辑区 id 必须 `editor` 或 `editor:<uuid>`、`open`/`minimized` 不可重复且必须是已知面板、组 `active` 必须属于该组、`autoHide` 的键必须既在 `open` 又在 `minimized` 之一。

错误文案（会被 UI 直接展示，改时同步测试）：`保存的视图数据过大，已保留原记录。`、`保存的视图数据无法读取，已保留原记录。`、`保存的视图结构过深，已保留原记录。`、`保存的视图格式无效，已保留原记录。`、`视图包含重复或缺失的编辑区，已保留原记录。`、`视图的面板状态无效，已保留原记录。`、`视图的标签页状态无效，已保留原记录。`。

`remapViewLayout(layout, mapping)` 用于文件改名/移动后把旧 id 映射到新 id。

## 9. `panelCatalog.ts` — 面板目录

`PanelCategory = files | documents | writing | ai | tools`（显示名：文件管理 / 正文编辑区 / 写作辅助 / AI / 工具）。

- `panelCategory(item)`：显式 `category` 优先；否则按 id 猜——`files|file|trash` → files，`editor`/`editor-*`/`editor:*`/`fixed` → documents，`outline|toc|draft|scratch|annotations|annotation` → writing，`chat|conversation|basis` → ai，其余 tools。
- `filterPanels(items, category, query)`：query 按空白切词，全部命中 `label + description + keywords` 才保留；有搜索词时忽略分类。
- `groupPanels(items)`：按分类分桶，供 `PanelSwitcher` 渲染。

## 10. 手势层

`railHoldGesture.ts`：`RAIL_HOLD_MS=1000`、`RAIL_MOVE_PX=5`。

- `RailHoldGesture`：按下→`arm(now)` 满 1 秒才武装；未武装时移动超 5px 直接 `cancelled`；`end()` 返回是否已武装（决定「点击打开」还是「拖出」）。`effectiveRailHoldMs` 把配置值与最小值（默认 200ms）取大。
- `railDropOffset(x,y,rect)`：落在图标条上 → `0.25`/`0.75`（上下半区）。
- `railDragTarget(edge,x,y,rect,viewport,scale)`：在图标条范围内返回 offset；向内拖 ≥`64*scale` 返回 `'dock'`（拖回停靠）。
- `railCrossTarget(source,...)`：左右两条图标条之间的跨边拖拽，返回 `{kind:'rail',edge,offset}` 或 `{kind:'dock'}`。

`panelLockGesture.ts`：`PanelLockGesture = 'doubleClick' | 'longPress'`、`PANEL_LOCK_HOLD_MS=600`、`PANEL_LOCK_MOVE_PX=5`。

- `PanelLockGestureTracker(mode, toggle)`：`longPress` 模式下标题栏按住 600ms 触发锁定；移动 ≥5px 或 `end()` 取消。
- `doubleClick(id)`：`doubleClick` 模式返回 `true` 表示已处理（调用方据此阻止默认双击行为）。
- 只跟踪标题栏按下，内容区与控件由调用方过滤。

## 11. 新增一个面板

1. `App.tsx` `panelLabel` 加标题，在 JSX 里加一个 `<PanelFrame chrome={chrome} id=... title=... className=...>` 包住内容（外框职责见 §7）；入口在 `AppHeader` 的 `PanelSwitcher`，分类关键词补到 `panelCatalog`。
2. `viewPresets.ts` 的 `known` 集合加 id（否则旧视图校验会抛错）。
3. 若涉及主编辑区规则，检查 `workspacePolicy`（`isEditorPanel`、`canMovePanel`、`retainPrimaryEditor`）。
4. 需要默认尺寸就在 `usePanelWorkspace.suggestedRect` 加分支。
5. 有自动隐藏需求时确认 `autoHide` 的 `edge/offset` 计算能覆盖新尺寸。
6. 补 `panelLayout.test.ts` / `workspaceState.test.ts` / `workspacePolicy.test.ts` / `autoHide.test.ts` 的用例。
7. 更新本文档与 `frontend-map.md` 的面板清单；若新面板要在旧视图里存活，同步 `viewPresets.ts` 的 `known` 集合（§8）。

## 12. 易踩的坑

- **主编辑区不是普通面板**：任何"打开/收起/合并"路径都要过 `retainPrimaryEditor`，否则会出现只有对话没有正文的界面。
- **autoHide 与 minimized 必须同进同退**：只改一个会在恢复视图时报"面板状态无效"。
- **层号不要写死**：浮窗层号用 `rankedFloatingLayers` 归一，否则旧视图的 `layers` 会盖住新控件。
- **ratio 必须夹紧**：`.12–.88` 之外会让面板宽度归零。
- **测量与渲染同源**：`measureDockTree` 的 `gap=5` 要与 CSS 的间距一致。
- **删除面板要留 restore 锚点**：否则重新打开时尺寸丢失（`restoreDockAnchor`）。
