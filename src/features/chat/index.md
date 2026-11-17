# chat — 右侧对话面板与生成链

从「点发送」到「文档里出现建议」的完整链路：提示词组装 → SSE 传输 → 解析建议 → 生成 Proposal → 接受/撤销。也是「依据」页与参考资料、推理强度的归属地。

## 文件

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `writingGeneration.ts` | 305 | 生成编排：`generateWriting` 拼六组入参（document / model / conversation / lifecycle / references / ui），调 transport，解析建议生成 `Proposal`，维护代次与中断 |
| `generationTransport.ts` | 148 | 传输层：`streamModelText` 解析 `/api/generate` 的 SSE（chunk/done/error）；停止或异常时 `reader.cancel()` 并在 `finally` 里 `releaseLock()`，演示模式结束解绑监听，`generateDemoText` 是演示模式 |
| `proposalActions.ts` | 99 | `createProposalActions`：接受建议（写文档 + 压 undo）、拒绝、`undoAI` 回滚 |
| `referenceSources.ts` | 63 | 参考资料：`useReferenceSources` 状态、`normalizeReferenceSources` / `readReferenceSources` / `remapReferenceSources`、`referenceOverrides`、`fitReferenceMessages`、`withReferenceMessages` |
| `modelReasoning.ts` | 14 | 推理强度偏好：`ReasoningEffort`、`reasoningLevels`、`readReasoning` / `saveReasoning` / `useModelReasoning`（localStorage） |
| `chatTypes.ts` | 10 | `Message` 与开场白 `hello` |
| `ChatComposer.tsx` | 33 | 输入框：自增高（36–128px）、Enter 发送 / Shift+Enter 换行、发送/停止按钮、内嵌 `ModelPicker` |
| `ModelPicker.tsx` | 30 | 模型选择下拉（portal + 搜索 + 最近使用 + 推理强度） |
| `WritingModeControl.tsx` | 29 | 模式切换按钮：discuss / outline / edit / continue（`modeLabels` 在 `shared/core`） |
| `WritingDock.tsx` | 19 | 底部写作快捷栏：标注工具、模式按钮、AI 开关 |
| `FloatingOrb.tsx` | 89 | 对话收起时的可拖动悬浮球 |
| `InputBasisPanel.tsx` | 40 | 「依据」页：本轮将发送的内容预览（`InputBasisRequest`） |
| `input-basis.css` / `model-picker.css` / `writing-dock.css` | 9 / 4 / 14 | 样式 |

## 想改 X → 改哪里

| 想改 | 改这里 |
| --- | --- |
| 提示词怎么拼 | `shared/core.ts` 的 `makePrompt`（生成入口在 `writingGeneration.ts`） |
| SSE 解析 / 超时 | `generationTransport.ts`（服务端在 `server/index.mjs` `/api/generate`） |
| 建议落进文档的方式 | `proposalActions.ts` + `shared/core.ts` 的 `minimalReplacement` / `canApply` |
| 参考资料的预算与截断 | `referenceSources.ts` + `server/references.mjs` |
| 推理强度 | `modelReasoning.ts`（前端）+ `server/generation-options.mjs`（校验） |

## 不变量 / 坑

- `generateWriting` 是唯一的生成入口；`App.tsx` 的 `generate` 只做参数组装，不要在组件里直接调 `streamModelText`。
- 代次（`generation`）与 `AbortController` 必须同源：停止后到达的 chunk 必须被丢弃。
- 流必须收尾：`abort` → `reader.cancel()`，`finally` → `reader.releaseLock()`。只 abort 不 cancel 会挂住连接与 body 锁，连续生成几次就把内存和句柄拖住。
- 参考资料有字符预算（≤60000），超出的部分服务端会截断并在 `warnings` 里说明，不要在前端二次拼接全文。
- 推理强度非法值服务端直接 400，前端下拉只提供 `default|low|medium|high|xhigh`。

## 验证

- `writingGeneration.test.ts` — 编排与建议生成
- `generationTransport.test.ts` — SSE 解析
- `referenceSources.test.ts` — 参考资料归一化
- `modelReasoning.test.ts` — 偏好读写