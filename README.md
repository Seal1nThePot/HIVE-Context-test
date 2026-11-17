# HIVE Context 0.1.3

HIVE 是一款本地 Markdown 写作工具，支持文稿管理、大纲、草稿、文本标注和 AI 辅助写作。AI 修改先以建议呈现，采纳后进入正文。

> 当前为原型验证版，界面、配置格式与功能仍可能调整。重要文稿请另留备份，退出前保存正文和草稿。跨启动的布局、对话和撤销历史尚不能完整恢复。

## 主要功能

- Markdown 实时预览与源码编辑，支持表格、图片、数学公式和 YAML 笔记属性。
- 多文稿标签、文件与文件夹管理、全文检索、回收站和保存冲突检查。
- 正文与草稿排版预设，可调整宽度、行高、段落间距和首行缩进，保持 Markdown 原文。
- 面板分栏、标签组合、侧栏收纳，以及 Windows 系统独立浮窗。
- 文本标注、写作大纲、参考资料和可审阅的 AI 修改建议。
- 独立配色模板，内置青苔鎏金和地中海蓝；个人调色按模板保存。

## 从源码运行

需要 Node.js 22.12 或更新版本。在仓库根目录执行：

```powershell
npm ci
npm run desktop
```

`desktop` 会先构建前端，再启动 Electron。开发时使用 `npm run desktop:dev`，也可双击 `启动桌面开发.cmd`。

其他命令：

```powershell
# 自动化测试
npm test

# TypeScript 检查与前端构建
npm run build

# 构建 Windows 便携程序
npm run desktop:portable

# 浏览器开发入口，默认 http://127.0.0.1:4317/
npm run dev

# 启动已构建的浏览器版本
npm start
```

便携程序输出到 `release/`。完成打包后，`启动Windows版.cmd` 可打开 `release/win-unpacked/HIVE markdown editor.exe`。仓库不包含预先打包的程序。

## 源码结构

| 目录 | 内容 |
| --- | --- |
| `src/` | React 界面、CodeMirror 编辑器、功能逻辑及前端测试 |
| `server/` | 本机文件服务、模板、模型连接及服务端测试 |
| `desktop/` | Electron 主进程、窗口管理、预加载及测试 |
| `scripts/` | 桌面开发启动脚本 |
| `templates/` | 内置模板的名称、基础色和配色数据 |

此仓库保留源码、测试和构建配置。`docs/`、历史截图、交接记录、性能采样、依赖、安装包、缓存及本机运行数据均不纳入当前版本。公式压力测试自行生成样例，无需本地 `performance/` 目录。

## 数据与使用边界

源码运行默认在 `documents/` 保存文稿，在 `.local/` 保存本机状态；普通 Windows 打包版使用 `%APPDATA%\HIVE`。这些目录均不提交到仓库。

初始 AI 为演示模式，可在设置中配置自己的模型服务。当前生成界面沿用既有流程，尚未接入另行开发的独立 AI 模块；本仓库也不包含该独立模块。演示效果不代表真实模型的写作质量或兼容性。

## 许可证

本项目以 [GNU AGPL-3.0-or-later](LICENSE) 发布。如需闭源使用或商业授权，请联系作者。
