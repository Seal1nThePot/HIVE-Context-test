# HIVE markdown editor 0.1.7

HIVE 是基于 Electron、React 和 CodeMirror 的 Markdown 编辑器，提供仓库管理、文稿标注和 AI 写作协作。

## 使用

从 [GitHub Releases](https://github.com/Seal1nThePot/HIVE-Context-test/releases/latest) 下载 Windows x64 ZIP。解压完整目录后运行 `HIVE markdown editor.exe`。在「设置 → 关于 → 应用更新」可选择本地更新或从 GitHub 检查稳定版。已有文稿可通过仓库管理选择原文件夹。

## 内存与同步

- 目录快照按仓库复用；相同版本的同步响应省略目录树。首次、文件变化、显式刷新及低频校验更新索引。
- 自动索引跳过 node_modules；确认是 HIVE 源码工程时额外跳过根构建/交付目录及历史性能基线。普通仓库同名文稿目录保持可见。
- 同步只缓存已打开文件的属性和哈希提示，不缓存正文；未变化时避免反复读正文，定期重新核验哈希。保存仍完整检查磁盘基线。
- 创建时间状态复用有限缓存，外部移动/恢复的元数据改写会使缓存失效。切换仓库和退出会释放索引监听和缓存。
- 文件列表复用派生结果；主题逐样式表缓存，原生浮窗增量同步样式并回收观察器。

## 开发与验证

```powershell
npm ci
npm test
npm run build
npm run verify:app
```

开发启动使用 `npm run desktop:dev`。需要交付桌面包时，执行 `npm run desktop:folder`、`npm run verify:package` 和 `node scripts/verify-app.mjs --package`。

保存管线见 [架构说明](./docs/architecture.md)。窗口归属见 [窗口生命周期契约](./docs/panel-lifecycle.md)。
