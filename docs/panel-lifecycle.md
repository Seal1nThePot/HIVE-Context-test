# 0.1.5 窗口操作契约

本说明以 0.1.5 当前源码为准。保存格式继续使用现有 WorkspaceLayout；标题栏与系统关闭行为沿用原有产品规则。

## 数据归属

| 数据 | 持有者 | 用途 |
| --- | --- | --- |
| 停靠树、打开/收纳列表、回接锚点 | WorkspaceLayout / workspaceState | 排列与保存视图 |
| 会话恢复尺寸、收纳侧别、组恢复资料 | PanelLifecycle.homes / groups | 下一次打开与回接；不是当前宿主登记 |
| 操作编号、排队请求、拖动交接 | PanelLifecycle | 请求过期判断与统一清理 |
| 实际窗口、成员、活动项 | NativeHostRegistry | 唯一真实归属 |
| DOM 容器迁移、监听、计时器 | NativeHostRuntime | 建窗、握手、回接、资源回收 |
| 文稿、EditorState、撤销历史、未发送内容 | 原编辑器与业务会话 | 窗口生命周期不接管这些内容 |

## 入口和结果

| 入口 | 执行契约 |
| --- | --- |
| 打开 / 浮动 / 保存视图投影 | queue / queueGroup 发放带编号的请求；onReady / onFailure 只处理仍属于该操作的成员 |
| 停靠 / 单成员关闭或收纳 / 拉整条侧栏 | transition 校验 → returnMembers 迁移容器 → clear 清理过期会话信息 → 提交布局 |
| 整组停靠、浮动、拖动落位 | 同一成员清单执行；成员逐出后保留其余宿主和活动项 |
| 应用视图 / 重置 | 先取消手势，回接原实际宿主，清理旧请求，再提交新布局 |
| 原生拖动连接、取消、迟到回调 | 操作编号门控；取消恢复容器与原布局，失效来源退回主窗 |
| 系统关闭子窗 | 保持现有移回主窗口行为；未切换为讨论中的“× 一律关闭” |

操作内部区分 running、succeeded、rejected、cancelled、failed。同步迁移失败不提交布局；异步建窗失败回到可见停靠位置。成员转移完成前保留注册信息，批量 DOM 移动失败时回迁已经移动的容器。React 与原生窗口间没有跨系统原子事务。

## 故障恢复

- `extract` 与 `removeMember` 校验实参确为该宿主的成员，宿主标识不能混作成员。
- 拖动取消的挂载若失败，撤销刚恢复的成员登记并回到主窗，返回失败结果供上层恢复布局。
- 窗口回接通知抛错后继续关闭实际窗口与提交状态通知。
- 样式镜像观察器安装失败时，断开已经安装的观察器，再交由建窗失败路径回接。
- 独立窗初始化失败、超时和来源提前关闭均释放连接监听与定时任务；迟到回调不能关闭同一面板的新窗口。

## 计算与验证

原生窗口几何统一为“主窗口内容区 CSS 像素”的 Rect。`desktop/panelGeometry.cjs` 是读写边界：以 Electron `getContentBounds()` / `setContentBounds()` 读取和恢复内容区域，在主窗口内容区屏幕 DIP 与页面缩放之间作互逆换算。系统 DPI 由 Electron 处理，不重复乘入页面缩放。

每个实际宿主保存请求内容矩形和首次观察到的系统矩形；重新查询时只合入实际移动/缩放的差量，防止 Windows 边框或系统舍入在收纳/重开时累计。原生最小尺寸在恢复边界统一约束。`hive:panel-rect` 仅接受主窗口查询登记中的宿主；`NativeHostRuntime.rect()` 通过宿主编号读取同一份规范化结果，成员收纳、组迁移、视图保存及关闭回接不再读取浏览器 `outerWidth` / `screenX`。现有 WorkspaceLayout 格式保持不变。

`desktop/panelGeometry.test.mjs` 验证往返、原生最小尺寸、系统舍入、用户调整、主窗口移动/缩放及查询权限。`node scripts/verify-panel-geometry.mjs` 使用隐藏、不可聚焦的真实 Electron 窗口、真实 preload 和生产几何/ready 处理器，检查两屏不同 DPI、100%/125%/150% 页面缩放、30 次重复开关、10 次调整后重开、运行中主窗口移动与页面缩放、快速连点和组合宿主。`--package <release 目录>` 改为读取包内几何模块、preload 与 CSS。该检查抑制测试窗口的 show/showInactive，不代替可见窗口的鼠标验收。

布局归一化按布局/工作区边界缓存。可见停靠树及几何按布局、边界、实际窗口 Map 与操作 revision 缓存，布局、缩放引起的尺寸变化或宿主变化会失效。保留已有按帧合并手势机制。

`usePanelWorkspace.test.tsx` 检查最终显示和真实宿主；`nativeHostRuntime.test.ts` 检查 DOM 迁移失败、过期连接及资源清理；`panelLifecycle.test.ts` 检查请求所有权。文件与进程故障见 `server/stability.test.mjs`、`server/processStability.test.mjs`，完整结果见 `delivery/STABILITY-20261117.md`。

## 收纳与上下文菜单 · 2026-11-18

AutoHidePlacement可选`host`仅记录下次展开来源，不充当实际宿主登记。主窗停靠面板收纳后展开保持主窗；真正原生窗口收纳后展开恢复原生。旧无host布局用停靠restore锚点辨识主窗来源。字段随WorkspaceLayout保存，旧数据无需删除；NativeHostRegistry继续是实际宿主唯一归属源。

面板右键复用PanelControl的choices。组合非活动标签先选择其成员，再于下一任务打开该成员真实汉堡菜单；菜单portal与监听均属于当前ownerDocument。输入、CodeMirror和各业务自有菜单不交由通用路由替换。

文件到依据的跨窗拖放使用标准DataTransfer中的workspace、类型和相对路径，并在接收时对照当前目录；来源窗口的pointer命中逻辑仅用于同Document排序/移动。只读图片不是可写文稿；关闭被IME或宿主回接阻挡时，不可转为无state的dirty稿。
