# 运行手册（现状，2026-11-16）

## 1. 环境

- Node ≥ 22.12（`package.json` engines），npm 自带即可。
- Windows PowerShell 可用（`launch.ps1`、`启动原型.cmd` 依赖它）。
- 依赖只装一次：`npm ci`（有 lock）或 `npm install`。

## 2. 三种启动方式

```powershell
npm run dev            # 开发：Express + Vite middlewareMode，热更新，端口 4317
npm start              # 生产：Express 直接托管 dist/，需先 npm run build
powershell -File launch.ps1 -Open      # 后台启动并打开浏览器
powershell -File launch.ps1 -Restart   # 重启（先校验 pid 属于本项目）
powershell -File launch.ps1 -Stop      # 停止
```

`launch.ps1` 细节：pid/log 落在 `.local/server.pid`、`server.log`、`server-error.log`（非默认端口加 `-<port>` 后缀）；启动后轮询 `/api/health` 最多 20s，检查 `app`/`project`/`ready`；只停自己启动的进程（pid 文件 + 命令行含 `server\index.mjs`），端口被别的服务占用时直接报错。

## 3. 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `HIVE_PORT` | `4317` | 监听端口，仅绑定 127.0.0.1 |
| `HIVE_DOCUMENTS` | `<project>\documents` | 文档根目录（写作空间的默认根） |
| `HIVE_STATE_DIR` | `<project>\.local` | 状态目录（配置、标注、大纲、草稿、视图） |
| `HIVE_API_KEY` | 无 | 仅启动时给选中/首个服务注入内存密钥，不落盘 |

## 4. 测试与构建基线

```powershell
npm test        # vitest run
npm run build   # tsc -b && vite build → dist/
```

当前基线：**43 个测试文件 / 350 项全部通过**（约 1.5s）。主要分布：

| 文件 | 项 | 文件 | 项 |
| --- | --- | --- | --- |
| `workspace/viewPresets.test.ts` | 22 | `workspace/workspacePolicy.test.ts` | 21 |
| `shared/core.test.ts` | 19 | `editor/noteProperties.test.ts` | 19 |
| `server/integration.test.mjs` | 19 | `editor/formatting.test.ts` | 18 |
| `workspace/autoHide.test.ts` | 16 | `workspace/dockInteraction.test.ts` | 16 |
| `annotations/annotations.test.ts` | 16 | `workspace/workspaceState.test.ts` | 14 |
| `editor/markdownDisplay.test.ts` | 11 | `server/explorer.test.mjs` | 9 |
| `settings/annotationPreferences.test.ts` | 8 | `settings/panelIconDragPreferences.test.ts` | 7 |
| `server/references.test.mjs` | 7 | `server/workspace.test.mjs` | 7 |
| `server/model-config.test.mjs` | 8 | `workspace/panelUiGeometry.test.ts` | 8 |
| `chat/generationTransport.test.ts` | 6 | `editor/tableWidget.test.ts` | 6 |
| `files/fileSync.test.ts` | 6 | `workspace/panelLayout.test.ts` | 6 |
| `editor/statusModel.test.ts` | 6 | `server/files.test.mjs` | 6 |
| `server/images.test.mjs` | 6 | `server/file-times.test.mjs` | 5 |
| `server/trash-retention.test.mjs` | 5 | `outline/tocModel.test.ts` | 5 |
| `editor/insertions.test.ts` | 5 | `editor/typewriter.test.ts` | 5 |
| `chat/referenceSources.test.ts` | 4 | `chat/writingGeneration.test.ts` | 4 |
| `files/explorerState.test.ts` | 4 | `workspace/panelLockGesture.test.ts` | 4 |
| `workspace/railHoldGesture.test.ts` | 4 | `app/api.test.ts` | 3 |
| `editor/searchTools.test.ts` | 3 | `workspace/panelCatalog.test.ts` | 3 |
| `chat/modelReasoning.test.ts` | 2 | `editor/EditorContextMenu.test.ts` | 2 |
| `outline/writingOutline.test.ts` | 2 | `annotations/tableAnnotationIds.test.ts` | 2 |
| `annotations/useAnnotationTool.test.ts` | 1 | | |

> `prototype/agent.md` 第 6 节仍写「12 文件 / 118 项」，已过时；本文为准。

## 5. 隔离的界面验证

不要和日常实例抢端口与文档：

```powershell
$env:HIVE_PORT="4327"; $env:HIVE_DOCUMENTS=".test-tmp\ui-check\documents"; $env:HIVE_STATE_DIR=".test-tmp\ui-check\state"; npm start
```

截图统一放 `evidence/`。验证完关掉进程并清理 `.test-tmp\ui-check`。

## 6. 常见坑

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 403 `只允许本机访问。` | Host 头不是 `127.0.0.1:<port>`/`localhost:<port>` | 用 localhost 访问，别用局域网 IP 或反代域名 |
| 409 `写作空间已在其他窗口切换。` | 同一浏览器多窗口共用 `x-hive-workspace` | 关掉旧窗口，或刷新后重试 |
| 409 `磁盘文件已变化，已阻止覆盖。` | baseline sha256 不符 | 界面里选择"采纳磁盘"或另存 |
| 409 `图片所属写作空间已变化。` | 图片 URL 里的 workspace 与当前不符 | 重开文档，重新插入图片 |
| 图片打不开 | 预览只允许 `documents` 内相对路径 | 确认文件在 `<文档名>pic/` 下，别用绝对路径 |
| 回收站看不到文件 | 回收站是 `documents/.hive-trash/`，以点开头 | 用界面里的回收站入口，别用资源管理器找 |
| 改名后标注/大纲丢失 | 元数据没跟着搬 | 只能用 `/api/explorer` 的 rename/move，别手动改文件名 |
| 端口占用 | 另一个实例还在跑 | `launch.ps1 -Stop` 或换 `HIVE_PORT` |
| 密钥重启即失效 | 密钥只在内存 | 重新填，或用 `HIVE_API_KEY` 启动 |
| `npm start` 白屏 | 没 build 或 dist 过期 | `npm run build` 后重启 |
| 开发模式改了 `server/*.mjs` 不生效 | 服务端不热更新 | 重启进程（前端改动会热更新） |
| 参考资料被截断 | 上限 32 项 / 合计 6 万字符 | 看 `warnings`，减少来源或改用文件引用 |
| 回收站清理报 token 无效 | 清理是两步：`preview` 出清单与 token，`purge` 必须带同一 token | 重新预览后再确认 |
| 400 `推理强度无效` | `reasoningEffort` 不在 `default/low/medium/high/xhigh` | 重新选择，别手改 localStorage |
| 文件创建时间变了 | 原子替换后 `dev/ino/birthtimeMs` 变了 | 正常行为：`file-times` 不冒充旧创建时间 |

## 7. 改完自查

1. `npm test` 全绿，且新增行为有对应用例。
2. `npm run build` 无 TS 错误。
3. 隔离端口起一遍，手动走：打开文档 → 编辑 → 等 2s 看是否被磁盘同步回滚 → 生成建议（可换推理强度）→ 采纳/撤销 → 新建/改名/回收站/还原 → 回收站清理两步确认 → 插入图片 → 加参考资料看 `basis` 面板。
4. 架构、契约、主流程有变化时同步更新 `docs/` 下对应文件。
