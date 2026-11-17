# annotations — 正文/草稿上的文字标注

选中一段文字 → 提一句要求 → 存盘 → 作为「生成依据」发给模型。标注按 `(source, file)` 归属：`source` 是 `document`（正文）或 `scratch`（草稿），`file` 是路径。

## 文件

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `annotations.ts` | 135 | 纯数据模型：`TextAnnotation` / `SubmittedAnnotation`、区间 `mergeAnnotationRecords` / `subtractAnnotationRanges` / `mapAnnotations`、`textFingerprint`、`validateSubmission`、发给 AI 的 `annotationMessages` / `annotationSummary` |
| `annotationDecorations.ts` | 39 | CodeMirror 装饰：`AnnotationMark`、`setAnnotationMarks`、`annotationHighlights`（高亮区间） |
| `useTextAnnotations.ts` | 460 | 核心 hook：按 `(source,file)` 载入/保存/同步；文档变化时 `mapAnnotations` 迁移区间；处理 revision 冲突与磁盘指纹；内存里的记录缓存由 `annotationCache` 裁剪 |
| `annotationCache.ts` | 9 | `pruneAnnotationCache`：只淘汰「干净且非活动」的记录（`seq===savedSeq && !busy && !loading && !error`），上限 12 条 / 4 MiB（`maxRecords` / `maxCharacters`），按 Map 插入顺序先淘汰最旧 |
| `useAnnotationTool.ts` | 37 | 标注工具开关：`isAnnotationSelectionKey` 判定选中文字的快捷键，`useAnnotationTool` 管工具态 |
| `useAnnotationActions.ts` | 128 | app 层动作：`markText` / `showLocalAnnotation` / `unmarkText` / `locateAnnotation` / `reanchorAnnotation` / `sendAnnotations` |
| `AnnotationPanel.tsx` | 50 | 右栏「标注」面板：列表、定位、删除、发送 |
| `InlineAnnotationEditor.tsx` | 245 | 选中文字旁的浮窗编辑器；`placeAnnotationWindow` / `clampAnnotationPosition` 定位夹紧；`tableAnnotationIds` / `tableBatchIds` 处理表格与批量标注 |
| `annotations.css` / `annotation-bubble.css` | 402 / 20 | 面板与浮窗样式 |

## 想改 X → 改哪里

| 想改 | 改这里 |
| --- | --- |
| 标注怎么跟着文字移动 | `annotations.ts` 的 `mapAnnotations`（区间映射）；调用方 `useTextAnnotations` |
| 浮窗出现的位置 | `InlineAnnotationEditor.tsx` 的 `placeAnnotationWindow` / `clampAnnotationPosition` |
| 保存冲突怎么处理 | `useTextAnnotations.ts` + `server/annotations.mjs`（revision + fingerprint） |
| 发给模型的措辞 | `annotations.ts` 的 `annotationMessages` / `annotationSummary` |
| 工具怎么开关 | `useAnnotationTool.ts`；UI 入口在 `chat/WritingDock.tsx` 的标注按钮 |
| 切文档后旧标注还占内存 | `annotationCache.ts` 的 `maxRecords` / `maxCharacters`；调用点在 `useTextAnnotations` |

## 不变量 / 坑

- 键是 `(source, file)` 二元组，不是单纯路径：草稿和正文可以有同名标注。
- 区间是 CodeMirror 偏移（`from`/`to`），任何文档改动都必须过 `mapAnnotations`，否则标注会错位。
- 表格里的标注用 `tableAnnotationIds` 区分单元格，删除表格行要一并清理。
- `useTextAnnotations` 内部持有 `saving`/`fingerprint`，外部不要另存一份标注状态。
- 缓存裁剪**不许**碰未保存、出错、在途或正在编辑的记录：`pruneAnnotationCache` 的过滤条件就是安全边界，放宽它会让用户的标注悄悄丢失。

## 验证

- `annotations.test.ts` — 区间运算、指纹、提交校验
- `annotationCache.test.ts` — 缓存裁剪：只淘汰干净非活动记录、条数与字符上限
- `tableAnnotationIds.test.ts` — 表格 id 解析
- `useAnnotationTool.test.ts` — 快捷键判定