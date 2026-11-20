# HIVE 0.1.6-r3

- 在当前 Git 检出目录或本仓库的隔离工作树中修改源码和运行验证。旧版本及当前运行实例独立保留。
- 文档会话持有正文、磁盘基线和未保存状态。窗口归属见 `docs/panel-lifecycle.md`，本地 HTTP 契约见 `docs/backend-contract.md`。
- 保留未保存正文、撤销历史、未确认提案、外部修改冲突检查及窗口归属行为。
- 全量测试用 `npm test`，生产构建用 `npm run build`。桌面联动使用隔离资料与隐藏窗口。真实桌面输入按上级 `.coordination/DESKTOP.md` 获取租约。
- 运行资料、用户文稿、模型凭据和构建产物留在版本库之外。
