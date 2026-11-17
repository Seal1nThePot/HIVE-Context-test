# HIVE markdown editor 0.1.5

基于 0.1.4 当前源码的独立内存优化版本。保留 Markdown 编辑、实时预览/代码/分栏、表格、图片、待办、主题、标注、AI 提案、仓库管理和原生浮窗。

本仓库发布测试版源码，Windows 运行包需要本地构建。当前自动化验证没有替代真实鼠标、中文输入法、跨屏与真实模型验收。

## 使用

首次使用需要 Node.js 22.12 或更新版本。先运行 `npm ci` 安装依赖，再用 `npm run desktop:dev` 开发运行；需要 Windows 文件夹应用时运行 `npm run desktop:folder`，完成后双击 `启动HIVE.cmd`。

日用入口使用本目录 `.runtime/user-data`，与旧版运行实例隔离。本版不自动复制原文稿、凭据或个人 profile；已有文稿可通过仓库管理选择原文件夹。

## 内存与同步

- 目录快照按仓库复用；相同版本的同步响应省略目录树。首次、文件变化、显式刷新及低频校验更新索引。
- 自动索引跳过 node_modules；确认是 HIVE 源码工程时额外跳过根构建/交付目录及历史性能基线。普通仓库同名文稿目录保持可见。
- 同步只缓存已打开文件的属性和哈希提示，不缓存正文；未变化时避免反复读正文，定期重新核验哈希。保存仍完整检查磁盘基线。
- 创建时间状态复用有限缓存，外部移动/恢复的元数据改写会使缓存失效。切换仓库和退出会释放索引监听和缓存。
- 文件列表复用派生结果；主题逐样式表缓存，原生浮窗增量同步样式并回收观察器。

## 开发与验证

```powershell
npm ci
npm run desktop:dev
npm test
npm run build
npm run desktop:folder
npm run verify:app
node scripts/verify-app.mjs --package
npm run verify:package
```

Windows 文件夹应用构建后，可运行 `node scripts/stress-storage.mjs` 和 `node scripts/stress-renderer.mjs` 做隔离压力测试。默认结果保存在 `.runtime/stress`，也可设置 `HIVE_STRESS_EVIDENCE`。前者默认覆盖 3 万篇文稿和 2 万个依赖文件；后者使用隐藏窗口和合成编辑事务，不代表真实键盘或中文输入法验收。

全量测试使用 Vitest，生产构建使用 TypeScript/Vite。0.1.5 当前全量 113 个测试文件、879 项通过；包内隐藏 Electron 的编辑、分栏和文件管理联动通过 24 项检查。压力测试脚本与本机原始数据另行记录，不能据此推算所有机器的长期内存占用。

开发、文稿、凭据、运行数据、历史备份和个人交接不随源码发布。应用需要的 [离线帮助](docs/help.md) 和 [更新日志](docs/CHANGELOG.md) 保留在仓库中，亦可在“设置 → 关于”查看。
