# workspace — 面板层（停靠 / 浮动 / 自动隐藏 / 视图）

整个工作台的「窗口管理」：布局是纯数据（可测试），交互意图单独一层，React 只做绑定与渲染。**详细算法与不变量见 [docs/workspace-ui.md](../../../docs/workspace-ui.md)**；独立窗口（面板移出/移回）见 [docs/packaging.md](../../../docs/packaging.md) §5 与 [docs/architecture.md](../../../docs/architecture.md) §8。这里只做文件索引。

## 文件

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| **纯数据层** | | |
| `panelLayout.ts` | 145 | 停靠树：`DockTree`、插入/摘除/合并/激活、`measureDockTree`、`resizeDockSplit`、`restoreDockAnchor`、`PANEL_HEADER_HEIGHT` |
| `workspaceState.ts` | 93 | 工作区布局：`open` / `minimized` / `rects` / `layers` / `floatingGroups` / `autoHide`，`completeWorkspace`、`placeWorkspacePanel`、`detach` / `float` / `hide` / `open` |
| `autoHide.ts` | 65 | 收起到边缘图标：`nearestPanelEdge`、`panelAutoHidePlacement`、`collapse` / `expand` / `release`、`placeRailIcons` |
| `workspacePolicy.ts` | 118 | 规则集中处：`retainPrimaryEditor`、`canMovePanel` / `canPlacePanel`、`panelLayers` / `rankedFloatingLayers`、`openDockedPanel`、位置锁定、`dockAutoHideRail` |
| `panelUiGeometry.ts` | 31 | 浮窗几何：`fitFloatingRect`、`resizeFloatingRect`、`placePanelActions` |
| `viewPresets.ts` | 62 | 视图快照校验：`ViewPreset`、`parseViewCollection`（尺寸/深度/数量限制）、`remapViewLayout`、`matchesViewEditor` |
| `panelCatalog.ts` | 27 | 面板目录：分类（files/documents/writing/ai/tools）、`filterPanels`、`groupPanels` |
| **手势层** | | |
| `dockInteraction.ts` | 68 | 拖拽意图：`DockIntent.step` → `DockFeedback`（guides / hover / progress），停留阈值 |
| `railHoldGesture.ts` | 33 | 图标条长按拖出：`RailHoldGesture`、`railDropOffset`、`railDragTarget`、`railCrossTarget` |
| `panelLockGesture.ts` | 21 | 位置锁定手势：双击或长按 600ms |
| **React 绑定** | | |
| `usePanelWorkspace.tsx` | 264 | 核心 hook：`panel(id)`、`open` / `close` / `minimize` / `toggle`、`capture` / `restoreLayout`、`splitEditor`、`openDocumentTab`、`locked`、`autoHideItems`、`prepareNativeFloat` |
| `useViewPresets.ts` | 39 | 视图预设的保存/切换 UI 状态 |
| `useViewSnapshots.ts` | 151 | `captureView` / `applyView`：把当前工作台存成快照、再完整恢复（含编辑区文档与滚动） |
| **组件** | | |
| `PanelFrame.tsx` | 80 | 面板外框 + `PanelControls`（标题栏按钮组）+ `PanelChrome` 类型 + `emptyPanelFooter` + `nativeWindowActions`（主窗三键 / 子窗只有最小化与关闭移回，子窗无最大化）；外层套 `DesktopPanel`，面板菜单带「浮动面板 / 移回主窗口」 |
| `PanelControl.tsx` | 68 | 单个面板控制按钮/菜单（浮动、停靠、关闭、最小化、成员操作）；点外关闭的监听挂在 `usePanelDocument()` 给的 document 上 |
| `PanelIconRail.tsx` | 46 | 边缘自动隐藏图标条 |
| `RailEdgeHandle.tsx` | 20 | 图标条拖拽把手 |
| `PanelSwitcher.tsx` | 102 | 「面板」下拉（portal、键盘导航、按 `panelCatalog` 分类与搜索） |
| `WorkspaceTabs.tsx` | 23 | 标签组渲染 |
| `DockGuides.tsx` | 24 | 停靠引导层 |
| `ViewControls.tsx` | 51 | 视图预设按钮 |
| **独立窗口** | | |
| `DesktopPanels.tsx` | 186 | 把面板搬进系统独立窗口：稳定 portal 容器、`window.open` + 子窗骨架与校验、样式镜像、CodeMirror `setRoot`、`panelReady`、窗口命令、IME 与超时兜底；主窗不再渲染占位卡片 |
| **样式** | — | `workbench-v3` 340 / `free-workspace` 109 / `panel-chrome` 107 / `panel-icon-rail` 30 / `panel-switcher` 23 / `rail-edge-handle` 9 / `view-presets` 17 / `dock-guides` 13 / `desktop-panels` 19（含无边框拖拽区、子窗铺满规则、`.header-window-controls` 样式） |

## 想改 X → 改哪里

| 想改 | 改这里 |
| --- | --- |
| 停靠/分栏规则 | `panelLayout.ts`（纯函数，先补测试） |
| 主编辑区不能被关/被合并 | `workspacePolicy.ts` 的 `retainPrimaryEditor` / `canMovePanel` / `canPlacePanel` |
| 拖拽手感（停留多久显示引导） | `dockInteraction.ts` 的 `GUIDE_PAUSE_MS` / `SPLIT_DWELL_MS` / `STACK_DWELL_MS` |
| 图标条长按时长 | `railHoldGesture.ts` 的 `RAIL_HOLD_MS`（偏好项在 `settings/usePanelIconDragPreferences.ts`） |
| 面板标题栏按钮 | `PanelFrame.tsx` 的 `PanelControls` + `PanelControl.tsx` |
| 视图保存/恢复 | `useViewSnapshots.ts` + `viewPresets.ts` |
| 面板能不能移出/移回独立窗口 | `DesktopPanels.tsx`（`detach` / `attach`）；菜单入口在 `PanelFrame.tsx` 的 `PanelControls` |
| 主窗右上角窗口按钮（最小化/最大化还原/保存并退出） | `src/app/AppHeader.tsx` 的 `.header-window-controls`；样式在 `desktop-panels.css` |
| 子窗的窗口按钮（最小化/关闭移回） | `PanelFrame.tsx` 的 `nativeWindowActions(id)` → `window.hiveDesktop.windowCommand` → `desktop/main.mjs`（`commandAllowed` 拒绝子窗 `maximize`） |
| 子窗里样式不对/菜单弹错窗口 | `DesktopPanels.tsx` 的 `mirrorAppearance`；组件侧一律用 `usePanelDocument()` 取 document |
| 子窗开不出来 / 尺寸不对 | `desktop/main.mjs` 的 `panelId` 与 `panelBounds`（主进程才是真正的窗口创建者） |

## 不变量 / 坑

- 主编辑区不是普通面板：任何打开/收起/合并路径都要过 `retainPrimaryEditor`。
- `autoHide` 与 `minimized` 必须同进同退，否则恢复视图会报「面板状态无效」。
- 浮窗层号用 `rankedFloatingLayers` 归一，不要写死。
- `measureDockTree` 的 `gap=5` 要与 CSS 间距一致。
- `PanelFrame` 必须保留 `ref` / `style` / `data-panel-id` / `onPointerDownCapture` / `panel.handles`，否则拖拽与浮动定位失效。
- **一个面板只被一个 document 持有**：`.desktop-panel-surface` 是同一个 DOM 节点，在父窗与子窗之间搬来搬去，绝不复制；搬完必须对每个 `.cm-editor` 做 `setRoot(newDoc)` + `requestMeasure()`，否则光标/滚动/尺寸全错。
- **只能搬 portal 容器**：React 19 的事件委托挂在 root 与 portal 容器上，搬 `PanelFrame` 的 `<aside>`（在 `#root` 内）会丢合成事件。
- **搬移期间不动几何**：子窗里面板靠 `desktop-panels.css` 覆盖成 `position:fixed; inset:0`，父窗的 `panel.style` 原样保留，回搬时不需要重算。
- **组词中禁止搬移**：`isComposing()` 为真时 `detach`/`attach` 都直接拒绝，避免 IME 组合串到另一个窗口。
- **子窗显示要等 `panelReady`**：子窗创建时 `show:false`，渲染端搬完容器并确认有 `[data-panel-id]` 后才发 `hive:panel-ready`，主进程再 `show()`——顺序反了会白屏闪一下。
- **关闭编辑区前先回搬**：`closeEditor` / `minimizeEditor` 里 `desktopPanels.attach(id)` 返回 false（组词中）就中止，否则子窗还拿着 DOM、父窗已卸载。
- **子窗不可最大化**：主进程 `maximizable:false`、`commandAllowed(command, isPanel)` 拒绝 `maximize`、`maximize` 事件强制还原 `normalBounds`；渲染端 `nativeWindowActions(id)` 也不再给子窗最大化项。
- **移出后主窗不留占位**：`.desktop-panel-home` 是 `display:contents` 的空节点；移回唯一入口在子窗标题栏面板菜单。
- **手势只认主窗**：`usePanelWorkspace` 的 `beginDrag` / `resize` 首行 `if(event.currentTarget.ownerDocument!==document)return;`——子窗里的指针手势直接忽略，不会拿父窗坐标系改布局。

## 验证

- `panelLayout.test.ts`、`workspaceState.test.ts`、`workspacePolicy.test.ts`、`autoHide.test.ts`、`dockInteraction.test.ts`、`viewPresets.test.ts`、`panelCatalog.test.ts`、`panelUiGeometry.test.ts`、`railHoldGesture.test.ts`、`panelLockGesture.test.ts`
- `DesktopPanels.tsx` 没有单测（依赖真实 `window.open` 与 CodeMirror DOM），只能手测：移出 → 在子窗里打字/Ctrl+S/打开菜单 → 移回 → 关子窗 → 刷新子窗 → 退出时保存等待。