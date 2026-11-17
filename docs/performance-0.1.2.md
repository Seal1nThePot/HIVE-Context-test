# 0.1.2 性能、代码原因与验证

更新：2026-11-17。当前版本主要处理限额内的大文件响应、后台界面和文件生命周期；先保留可编辑性与历史，再减少重复计算和内存。源码仓库不包含本机运行目录、个人测试文稿、完整原始采样或数百 MB 的生成件；仅保留自动化测试必需的纯合成公式验收样例。

## 代码与原因

| 对应代码 | 原因与处理 |
| --- | --- |
| `src/features/editor/tableViewport.ts`、`tableWidget.ts`、`markdownDisplay.ts` | 巨表按行/单元格预算分块，保留真实块间换行，使 CodeMirror 视口裁切生效；只创建当前块 DOM。 |
| `src/features/editor/markdownParse.ts`、`markdownPresentation.ts`、`sourceSyntax.ts` | 复用不可变文本和解析片段；安全单格编辑走局部路径；大文档的重复源码着色采用轻量表格轮廓。 |
| `src/features/editor/documentText.ts`、`EditorStatusBar.tsx`、`statisticsService.ts` | 正文未变时不展开全文判断 dirty；大文档统计使用后台线程，隐藏时取消订阅，空闲回收。 |
| `src/shared/panelActivity.ts`、`src/features/editor/editorSleep.ts`、`editorViewSnapshot.ts` | 用每个实际宿主的可见性决定休眠；250 ms 内快切复用 View，释放界面时保留原 EditorState、历史和双向滚动。 |
| `src/features/workspace/DesktopPanels.tsx`、`usePanelWorkspace.tsx`、`useViewSnapshots.ts` | 区分主窗标签和原生宿主活动页，多个可见编辑区不因全局焦点不同而误休眠；保存休眠后的滚动。 |
| `src/features/files/fileOperations.ts`、`useFileActions.ts` | 按目标会话、正文、绑定代次和存活范围检查异步读取；旧请求不覆盖新输入或新目标，忙碌状态只由所属操作释放。 |
| `src/features/files/useDocumentPersistence.ts`、`fileSync.ts` | 保存快照仅展开一次，后续用 Text 比较 dirty；同路径不重建历史，新视图共享 Text 并保持独立回调。 |
| `src/features/editor/storedDocumentChanges.ts`、`src/features/annotations/storedAnnotationChanges.ts` | 无 View 时用真实 Transaction 映射上层待审、请求、标注和目录；同源多视图去重，交叠后还原仍失效。 |
| `src/features/editor/mathSyntax.ts`、`mathRender.ts`、`mathRenderer.ts`、`mathWidget.ts` | 本地 KaTeX 公式排版，工作线程和 DOM 提交有预算；不预先为全篇数万公式创建 HTML，错误保留原文。 |

完整实现位于 [src](../src/)。解析、视口、任务调度和文件生命周期都保留对应自动化测试。

## 测量结果

使用本机冻结快照、生产构建和独立合成副本。依次打开 small、约 1.8 MB 纯文字、巨表、密集公式，再返回 small；比较阶段开始后 T+25 秒之前最后五次进程树采样的中位数。

| 场景，MiB | 本轮前 | 后台休眠后 | 文件生命周期优化后 |
| --- | ---: | ---: | ---: |
| 四标签、三大文件后台：私有提交 | 465.55 | 429.75 | 428.67 |
| 同阶段：工作集合计 | 822.54 | 789.39 | 790.79 |
| 关闭三面板后：私有提交 | 432.30 | 432.16 | 427.79 |
| 同阶段：工作集合计 | 787.34 | 786.88 | 785.53 |

四标签后台私有提交在本次观测中减少约 36.88 MiB / 7.9%；关闭后的额外变化较小。各阶段仅单轮，不能逐项归因或推导普遍降幅。工作集含共享页，并非独占物理 RAM；离散采样不是瞬时峰值，未通过强制 GC 或清工作集制造结果。

1,800,019 字节巨表的同路径重复打开，旧方法单次约 129.5 ms、两次全文展开、undoDepth 1→0；最终方法单次约 0.1383 ms、零次展开，并保留原 State/undoDepth。这是跳过不必要重建的 hook 微基准，不是整机/UI 倍数或输入到上屏 P95。

## 验证与边界

- 完整 `npm test`：65 文件、533 项通过；`npm run build` 通过。
- 实际桌面验证了自动保存开/关、同文件双视图同步、后台返回、重复打开后的撤销/重做及保存 SHA 恢复原值。
- 独立受控检查覆盖乱序结果、等待期间继续编辑、同路径历史保留、保存期间新输入，以及无 View 事务对待审和标注的保护。
- 最小化后外部修改的界面恢复受桌面工具限制未完成观察；真实 IME、多个原生宿主和长期稳定性未全面覆盖。早期仅截图疑似旧文字未被 AX、trace 和最终生产复测确认，不据此宣称已定位或修复 State 故障。
- 关闭面板仍保留正文、历史和上下文，内存不会归零。正常环境 100 MB 目标尚未验收；文件读取限制仍是 2,000,000 字节。

测试件生成见 [performance/README.md](../performance/README.md)。原始大文件和本机采样留在本地，避免把个人工作区和运行数据上传到源码仓库。
