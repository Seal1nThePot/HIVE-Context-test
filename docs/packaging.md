# 封装成桌面软件（方案，2026-11-16）

现状：前端 + 本地 Express 服务（`server/index.mjs`）已经是一个完整的"本机单用户应用"，缺的只是一个带窗口、带安装包的外壳。

## 1. 先明确约束

- **必须有 Node 进程**：文档读写、`/api/generate` 代理、SSE 流、文件锁都在 `server/*.mjs` 里，纯静态 `file://` 打不开。
- **不能改成直连模型**：密钥只存内存、代理在服务端，绕过服务会同时丢掉安全边界和冲突保护。
- **数据必须在用户目录**：`HIVE_DOCUMENTS` 指向用户选的写作目录，`HIVE_STATE_DIR` 指向应用数据目录，不能写进安装目录（Program Files 不可写、升级会被覆盖）。
- **端口不能固定**：用户机器上 4317 可能被占，外壳应让服务端监听 `127.0.0.1:0` 取随机端口。

## 2. 两种路线

| | Electron | Tauri 2 |
| --- | --- | --- |
| Node 运行时 | 自带（主进程就是 Node） | 没有，需 sidecar 打包 node.exe 或重写服务 |
| 接入现有代码 | 主进程 `import` 或 `fork` 现有 `server/index.mjs` 即可 | 要么带一个 node 二进制（体积 + 进程管理复杂度），要么把 6 个 `server/*.mjs` 用 Rust 重写 |
| 体积 | 安装包 ~80–100 MB | 外壳 ~5 MB（但带 Node sidecar 后回到 40 MB+） |
| 内存 | 较高 | 低 |
| 生态/踩坑 | 成熟，文档多 | 需要 Rust 工具链，Windows WebView2 依赖 |

**建议：先 Electron**。理由：服务端是 Node 写的、已有 238 项测试，Electron 能把"打开即用"做到零改造；Tauri 只有在"体积/内存是硬指标"且愿意重写服务端时才值得。

## 3. Electron 落地步骤

### 3.1 目录约定

```
prototype/
  electron/main.mjs      # 主进程：起服务、开窗口、菜单、单实例
  electron/preload.mjs   # 只暴露必要能力（可选，本应用几乎不需要）
  electron-builder.yml   # 打包配置
  server/                # 原样复用
  dist/                  # vite 产物
```

### 3.2 主进程要点

1. `app.requestSingleInstanceLock()`，第二个实例只聚焦已有窗口。
2. 端口：设 `process.env.HIVE_PORT = "0"`，并让 `server/index.mjs` 在 `listen` 后把 `server.address().port` 通过 IPC 或 stdout 一行 JSON 报给主进程（当前是写死 4317，需要一处小改：`HIVE_PORT=0` 时读取实际端口并 `console.log` 一行 `hive-ready <port>`）。
3. `HIVE_STATE_DIR = app.getPath("userData")`，`HIVE_DOCUMENTS` 默认 `path.join(app.getPath("documents"), "HIVE")`，首次启动引导用户选目录（`dialog.showOpenDialog`），选择结果写进 `userData/workspace.json` 前先跑一次 `workspaceStore.prepare` 校验。
4. `HIVE_API_KEY` 不设；密钥由界面填，仍只存内存。
5. 窗口：`new BrowserWindow({width:1280,height:820,minWidth:900,minHeight:600,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}})`，`loadURL("http://127.0.0.1:<port>/")`。
6. 安全：`webContents.setWindowOpenHandler` 全部拒绝；`will-navigate` 只允许本机端口；生产环境关掉 DevTools 快捷键。
7. 退出：`before-quit` 里关服务端（`server.close()` + 关 SSE 连接），避免残留进程。
8. 崩溃兜底：主进程 `uncaughtException` 写 `userData/logs/main.log`；渲染进程崩溃时 `reload` 一次。

### 3.3 服务端需要的最小改动

| 位置 | 改动 | 为什么 |
| --- | --- | --- |
| `server/index.mjs` 监听处 | 支持 `HIVE_PORT=0` 并回报实际端口 | 避免端口冲突 |
| 静态目录 | 生产模式从 `dist/` 读，打包后路径要基于 `app.getAppPath()` | asar 内路径与开发不同 |
| `HIVE_DOCUMENTS` 默认值 | 允许由外壳传入 | 用户目录选择 |
| `/api/health` | 增加 `version` 字段 | 升级与支持排查 |

### 3.4 `electron-builder` 配置骨架

```yaml
appId: com.hive.writing
productName: HIVE
files: ["dist/**", "server/**", "electron/**", "package.json"]
asar: true
win: {target: [{target: "nsis", arch: ["x64"]}], icon: "build/icon.ico"}
nsis: {oneClick: false, allowToChangeInstallationDirectory: true, perMachine: false}
extraMetadata: {main: "electron/main.mjs"}
```

注意：`package.json` 里的 `dependencies` 会被打进包，`devDependencies` 不会——`express`/`zod` 必须在 `dependencies`（现状已满足）。`lucide-react`、`react` 已被 vite 打进 `dist`，可考虑在生产依赖里去掉以减少体积（保留也行，只是多几十 MB）。

### 3.5 命令

```powershell
npm run build                 # dist/
npx electron .                # 本地跑外壳（开发时也可以直接指向 dev 服务）
npx electron-builder --win nsis   # 出安装包，产物在 release/
```

## 4. 升级与签名

- **签名**：Windows 未签名会触发 SmartScreen 警告。内测可先不签；对外分发需要 OV/EV 证书（`electron-builder` 配 `win.certificateFile`/`certificatePassword` 或用 Azure Trusted Signing）。
- **自动更新**：`electron-updater` + `generic`/`github` provider；更新包只替换 `dist/`、`server/`、`electron/`，**绝不能动用户文档目录**。
- **版本兼容**：`model.json` 已有 `schemaVersion` 与 `migrate()`，升级时继续沿用；`workspace.json`、`text-annotations.json` 等也要保持向后兼容，或写迁移函数。

## 5. 验收清单

1. 全新机器安装后首次启动：能选目录、能建文档、能保存。
2. 断网可用（除生成外全功能）。
3. 关闭窗口后任务管理器无残留 node 进程。
4. 端口冲突时不崩（`HIVE_PORT=0`）。
5. 从旧版升级后：文档、标注、大纲、视图预设全部还在。
6. 卸载不删用户文档（NSIS 默认只删安装目录）。
7. 双击 `.md` 打开（可选）：注册文件关联，走 `open-file` 事件。

## 6. 体积预期

| 组成 | 大小 |
| --- | --- |
| Electron 运行时 | ~70 MB |
| `dist/`（含 lucide 图标、CodeMirror） | ~3–5 MB |
| `server/` + 生产依赖（express/zod） | ~5 MB |
| 安装包（NSIS 压缩） | ~80–95 MB |

如果体积不可接受，再考虑 Tauri + 把服务端重写成 Rust（工作量大，且要重做 238 项测试覆盖的行为）。
