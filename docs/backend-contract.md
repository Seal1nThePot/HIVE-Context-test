# 后端契约（现状，2026-11-16）

服务端只有一个进程：`server/index.mjs`（Express 5，326 行）。所有业务状态都在磁盘，进程内只有队列、锁与 API Key。

## 1. 前置条件（每个 `/api/*` 请求都会过）

1. **本机限定**：`Host` 必须是 `127.0.0.1:<port>` 或 `localhost:<port>`，否则 403 `只允许本机访问。`
2. **来源校验**：带 `Origin` 时必须同源，否则 403 `请求来源不匹配。`
3. **不缓存**：统一 `Cache-Control: no-store`。
4. **JSON 上限 3 MB**：`express.json({limit:"3mb"})`（图片上传走 `express.raw`，另有 12 MB 上限）。
5. **写作空间上下文**：路径首段属于 `workspaceRoutes`（`writing-outline / annotations / scratch / outline / tree / file / folder / rename / workspace / explorer / images`）时，按 `x-hive-workspace` 头取空间，过期即 409 `写作空间已在其他窗口切换。`
6. **POST 串行化**：同一空间内的 POST（`/workspace/sync` 除外）在服务端排队，前一个响应结束才处理下一个——结构操作与元数据保存不会互相插队。

环境变量：`HIVE_PORT`（4317）、`HIVE_DOCUMENTS`（文档根）、`HIVE_STATE_DIR`（状态目录）、`HIVE_API_KEY`（启动时注入到选中/首个服务的密钥，仅内存）。

## 2. 路由表

| 方法 | 路径 | 入参 | 出参 |
| --- | --- | --- | --- |
| GET | `/api/health` | — | `{app:"hive-writing-prototype",pid,project,ready}` |
| GET | `/api/workspace` | — | `{id,root,autoSave,revision}` |
| POST | `/api/workspace` | `{root,autoSave,revision}` | 同 GET；`revision` 过期 → 409 |
| POST | `/api/workspace/sync` | `{paths: string[]}`（≤100） | `{workspace,entries,files}`；不排队 |
| GET | `/api/tree` | — | `{root,entries}`（文件夹优先，`zh-CN` 排序） |
| GET | `/api/file` | `?path=` | `{path,text,hash,eol,bom}` |
| POST | `/api/file` | `{path,text,baseline,eol,bom}` | 保存结果（含新 `hash`） |
| POST | `/api/folder` | `{path}` | `{ok:true}` |
| POST | `/api/rename` | `{from,to,baseline}` | 改名结果（`link`+`unlink`，不静默覆盖） |
| GET | `/api/scratch` | — | `{text,hash,path}`（固定 `自由草稿.md`） |
| POST | `/api/scratch` | `{text,baseline}` | 保存结果 |
| GET | `/api/annotations` | `?source=document\|scratch&file=` | `{revision,fingerprint,items}` |
| POST | `/api/annotations` | `{source,file,revision,fingerprint,items}` | 同 GET（`source/file` 由服务端校正） |
| GET | `/api/writing-outline` | `?file=` | `{revision,initialized,nodes}` |
| POST | `/api/writing-outline` | `{file,nodes,revision}` | 同 GET；`revision` 过期 → 409 |
| GET | `/api/outline` | `?file=` | `{key: description}`（旧版大纲备注） |
| POST | `/api/outline` | `{file,key,description}` | 同上（无 revision 校验） |
| GET | `/api/explorer/trash` | — | 回收站记录数组（按删除时间倒序） |
| GET | `/api/explorer/search` | `?folder=&query=` | `{matches:[{path,line,excerpt}],truncated}` |
| POST | `/api/explorer` | `{action,path?,parent?,name?,type?,id?}` | 见 §6 |
| POST | `/api/images` | 原始字节体（`application/octet-stream`）+ `?document=&name=` | `{path,reference}` |
| GET | `/api/images` | `?workspace=&document=&path=` | 图片字节（带 `nosniff` 与 sandbox CSP） |
| GET | `/api/config` | — | 模型配置（含每服务 `hasKey`） |
| POST | `/api/config` | `{revision,demo,continuationLimit,...}`（兼容旧 `{endpoint,model,key,clearKey}`） | 新配置；`revision` 过期 → 409 |
| POST | `/api/model-services` | 服务对象（可带 `key`） | 新配置；服务数上限 40 |
| POST | `/api/model-services/remove` | `{id}` | 新配置（同时清除该服务密钥） |
| POST | `/api/generate` | `{messages,selection}` | SSE：`event: chunk\|done\|error` |

未命中的 `/api/*` → 404 `接口不存在。`；全局错误映射：`ENOENT`→404 `文件不存在，请刷新文件列表。`，`EEXIST`→409 `同名文件已存在，已阻止覆盖。`，其余 500 或 `error.status`。

## 3. 冲突闸（三道）

| 场景 | 机制 | 冲突响应 |
| --- | --- | --- |
| 正文保存 | 客户端回传 `baseline`（原始内容 sha256） | `hash(磁盘) !== baseline` → 409 `磁盘文件已变化，已阻止覆盖。…`；写入前再读一次校验，变化则 409 `保存期间磁盘文件发生变化…` |
| 标注 / 写作节点 / 空间 / 模型配置 | `revision` 整数 | 各资源各自的 409 文案（见前端 `setError` 展示） |
| 多窗口空间切换 | `x-hive-workspace` | 不匹配 → 409 `写作空间已在其他窗口切换。` |
| 图片预览 | `?workspace=` 必须等于当前空间 id | 不匹配 → 409 `图片所属写作空间已变化。` |

## 4. `/api/generate`（SSE 代理）

- 入参校验：`messages` ≤ 160 条、`role ∈ {system,user,assistant}`、`content` 为字符串、序列化后 ≤ 120000 字符，否则 400 `本轮上下文无效或过长（上限 12 万字符），请缩小当前文档或新开会话。`
- 端点拼接：`endpoint` 以 `/chat/completions` 结尾则直接用，否则追加；`Authorization: Bearer <key>` 仅在内存有 key 时加。
- 流式：`event: chunk`（delta 文本）、`done`、`error`；非 SSE 响应则退化为一次性 `chunk` + `done`。
- 完整性：必须收到正文且 `finish_reason === "stop"`，否则 `模型响应中断或未返回正文，未生成可采纳建议。`；非 stop 报 `生成未完整结束（<reason>），请重试。`
- 超时/中断：客户端断开或 120 秒超时 → `AbortController.abort()`，报 `请求已停止或超时。`；连接失败报 `无法连接模型端点，请检查本机网络及端点地址。`
- 首字节前出错 → 502 JSON；已发头后出错 → `event: error`。

## 5. `files.mjs`（Markdown 文件层）

- `resolve()` 拒绝：`..`/`.` 段、含 `:*?"<>|` 的段、非 `.md` 后缀、符号链接/junction（逐段 `lstat`）。
- `read()` 上限 2 MB；返回 `text`（去 BOM、CRLF→LF）、`hash`（原始字节 sha256）、`eol`、`bom`。
- `save()` 每文件一把 promise 锁（键为小写路径），临时文件 `.<name>.<uuid>.tmp`（`wx`）→ rename。
- `rename()` 先 `link` 再 `unlink`，目标存在即失败（不静默覆盖）。
- `transaction()` 供 explorer / images 组合多次写入。

## 6. `explorer.mjs`（结构操作）

`POST /api/explorer` 的 `action`：

| action | 入参 | 行为 |
| --- | --- | --- |
| `create` | `{parent,type:"file"\|"folder"}` | 自动去重命名（`新建文档.md` / `新建文档 2.md`）；文件夹用 `mkdir` |
| `rename` | `{path,name}` | 校验名字（禁斜杠、结尾 `. `、Windows 保留名）；文件补 `.md` |
| `move` | `{path,parent}` | 禁止把文件夹移进自身子树 |
| `duplicate` | `{path}` | 生成 `… 副本.md` / `… 副本` |
| `trash` | `{path}` | 移到 `documents/.hive-trash/<uuid>` + 同名 `.json` 记录；`自由草稿.md` 拒绝 |
| `restore` | `{id}` | 按记录回原路径；目标已存在 → 409 |
| `reveal` | `{path}` | 仅 Windows：`explorer.exe /select,` |

所有改动路径的操作都在 `files.transaction()` 内，并调用 `remapMetadata(state, from, to)` 同步迁移标注/大纲键；迁移失败则回滚文件移动。

`GET /api/explorer/search`：`query` 1–200 字，按小写子串匹配内容与文件名，最多 200 条，返回行号与 25+60 字上下文；超过 2 MB 或已删除的文件跳过。

## 7. `images.mjs`（图片）

- 上传：`MAX_IMAGE_BYTES = 12 MB`；按魔数识别 PNG/JPG/GIF/WebP，其他 400 `支持 PNG、JPG、GIF 和 WebP 图片。`
- 落盘：与文档同级的 `<文档名>pic/` 目录，文件名去非法字符、截 100 字、冲突加 `-2`；返回 `{path, reference}`（`reference` 是相对文档的 Markdown 路径）。
- 预览：只接受相对路径，拒绝 `scheme:`、绝对路径、NUL、非图片后缀、符号链接、> 12 MB；响应 `X-Content-Type-Options: nosniff` 与 `Content-Security-Policy: default-src 'none'; sandbox`。

## 8. `metadata-paths.mjs`

`remapMetadata(state, from, to)` 同时改三份 JSON 的键：`text-annotations.json`（键 `document:<path>`，并改每条 `item.file`）、`writing-outline-nodes.json`、`writing-outlines.json`。任一步失败按记录回滚；目标键已存在则报 `目标路径已有标注或大纲记录，请换一个名称。`

## 9. `model.json`（schemaVersion 2）

```json
{
  "schemaVersion": 2,
  "revision": 3,
  "demo": false,
  "continuationLimit": 100,
  "services": [{"id":"…","name":"…","endpoint":"https://…","enabled":true,
                "models":[{"id":"…","name":"…"}]}],
  "selection": {"serviceId":"…","modelId":"…"}
}
```

- `endpoint()` 拒绝带凭据/查询串/片段的 URL 与非 http(s)；`text()` 拒绝换行与 NUL。
- `migrate()` 把旧版单端点变成 `id: "legacy"` 的服务；`reconcile()` 在模型不存在或服务被停用时清空选择并切回演示模式。
- 密钥只在内存 `Map`，`read()` 只回 `hasKey`；换端点即丢 key。

## 10. 加一个后端能力的六步

1. 在 `server/<area>.mjs` 写 store 工厂，返回纯函数对象，不做 HTTP。
2. 在 `workspace.mjs` 的组合处挂上它，拿到 `root / files / state` 依赖。
3. 在 `index.mjs` 加路由；路径首段加进 `workspaceRoutes`（需要空间上下文时）。
4. 校验入参，错误用 `Object.assign(new Error(msg),{status})` 带上状态码。
5. 需要一致性的多步写入走 `files.transaction()`；涉及路径变化调 `remapMetadata`。
6. 写 `server/<area>.test.mjs`（直接测 store，不启 HTTP），并在本文件补一行。

