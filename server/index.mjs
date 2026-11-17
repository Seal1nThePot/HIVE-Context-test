import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import { workspaceStore } from "./workspace.mjs";
import { modelConfigStore } from "./model-config.mjs";
import {imageStore,MAX_IMAGE_BYTES} from './images.mjs';
import {resolveReferences} from './references.mjs';
import {reasoningOptions} from './generation-options.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "..");
const root = path.resolve(
  process.env.HIVE_DOCUMENTS || path.join(project, "documents"),
);
const local = path.resolve(
  process.env.HIVE_STATE_DIR || path.join(project, ".local"),
);
let port = Number(process.env.HIVE_PORT ?? 4317);
await fs.mkdir(root, { recursive: true });
const modelSettings = await modelConfigStore(local, {envKey:process.env.HIVE_API_KEY || ""});
const spaces = await workspaceStore(local, root);
const scratchPath = "自由草稿.md";
const app = express();
app.disable("x-powered-by");
app.use("/api", (req, res, next) => {
  const host = req.headers.host;
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host))
    return res.status(403).json({ error: "只允许本机访问。" });
  const origin = req.headers.origin;
  if (
    origin &&
    ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin)
  )
    return res.status(403).json({ error: "请求来源不匹配。" });
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "3mb" }));
app.get('/api/workspace', (_req,res)=>res.json(spaces.read()));
const workspaceRoutes = new Set(['writing-outline','annotations','scratch','outline','tree','file','folder','rename','workspace','explorer','images','references']);
const mutationQueues=new Map();
app.use('/api', (req,res,next)=>{
  if(!workspaceRoutes.has(req.path.split('/')[1])) return next();
  try {
    req.workspace=spaces.capture(req.headers['x-hive-workspace']);
    if(req.method!=='POST'||req.path==='/workspace/sync')return next();
    const id=req.workspace.id,previous=mutationQueues.get(id)||Promise.resolve();
    let release;const done=new Promise(resolve=>{release=resolve;});mutationQueues.set(id,done);
    let released=false,started=false;const finish=()=>{if(released)return;released=true;release();if(mutationQueues.get(id)===done)mutationQueues.delete(id);};
    const json=res.json.bind(res);res.json=(...args)=>{try{return json(...args);}finally{finish();}};
    res.once('finish',finish);res.once('close',()=>{if(!started)finish();});
    previous.catch(()=>{}).then(()=>{if(res.destroyed){finish();return;}started=true;next();});
  }catch(error){next(error);}
});
app.post('/api/workspace', async(req,res)=>res.json(await spaces.update(req.body)));
app.post('/api/references/resolve',async(req,res)=>res.json(await resolveReferences(req.workspace,req.body)));
app.post('/api/workspace/sync', async(req,res)=>{
  const paths=req.body.paths;
  if(!Array.isArray(paths)||paths.length>100||paths.some(value=>typeof value!=='string')) return res.status(400).json({error:'同步文件列表无效。'});
  const unique=[...new Set(paths)], files=new Array(unique.length);
  const baselines=req.body.baselines;
  let next=0;
  await Promise.all(Array.from({length:Math.min(4,unique.length)},async()=>{
    while(next<unique.length){
      const index=next++,file=unique[index];
      const knownHash=baselines && typeof baselines==='object' && Object.hasOwn(baselines,file) ? baselines[file] : undefined;
      try{files[index]=await req.workspace.files.read(file,knownHash);}catch(error){files[index]={path:file,error:error.code==='ENOENT'?'文件已在磁盘删除或移动。':error.message};}
    }
  }));
  res.json({workspace:spaces.read(),entries:await req.workspace.files.list(),files});
});
app.get("/api/writing-outline", async (req, res) => {
  await req.workspace.files.read(req.query.file);
  res.json(await req.workspace.nodes.read(req.query.file));
});
app.post("/api/writing-outline", async (req, res) => {
  await req.workspace.files.read(req.body.file);
  res.json(
    await req.workspace.nodes.save(req.body.file, req.body.nodes, req.body.revision),
  );
});
async function annotationIdentity(req, source, file) {
  if (source === "document") {
    await req.workspace.files.read(file);
    return { source, file };
  }
  if (source === "scratch") return { source, file: "自由草稿" };
  throw Object.assign(new Error("标注来源无效。"), { status: 400 });
}
app.get("/api/annotations", async (req, res) => {
  const identity = await annotationIdentity(req, req.query.source, req.query.file);
  res.json(await req.workspace.annotations.read(identity.source, identity.file));
});
app.post("/api/annotations", async (req, res) => {
  const identity = await annotationIdentity(req, req.body.source, req.body.file);
  res.json(await req.workspace.annotations.save({ ...req.body, ...identity }));
});
app.get("/api/scratch", async (req, res) => {
  try {
    const data = await req.workspace.files.read(scratchPath);
    res.json({ text: data.text, hash: data.hash, path: scratchPath });
  } catch (error) {
    if (error.code === "ENOENT") res.json({ text: "", hash: null, path: scratchPath });
    else throw error;
  }
});
app.post("/api/scratch", async (req, res) => {
  const format = await req.workspace.files.read(scratchPath).catch(error => {
    if (error.code === "ENOENT") return {eol:"LF",bom:false};
    throw error;
  });
  res.json(
    await req.workspace.files.save({
      path: scratchPath,
      text: req.body.text,
      baseline: req.body.baseline,
      eol: format.eol,
      bom: format.bom,
    }),
  );
});
app.get("/api/outline", async (req, res) => {
  await req.workspace.files.read(req.query.file);
  res.json(await req.workspace.outlines.read(req.query.file));
});
app.post("/api/outline", async (req, res) => {
  await req.workspace.files.read(req.body.file);
  res.json(
    await req.workspace.outlines.save(
      req.body.file,
      req.body.key,
      req.body.description,
    ),
  );
});
app.get("/api/health", (_req, res) =>
  res.json({
    app: "hive-writing-prototype",
    pid: process.pid,
    project,
    ready: true,
  }),
);
app.get("/api/tree", async (req, res) =>
  res.json({ root:req.workspace.root, entries: await req.workspace.files.list() }),
);
app.get('/api/explorer/trash',async(req,res)=>res.json(await req.workspace.explorer.listTrash()));
app.post('/api/explorer/trash/preview',async(req,res)=>res.json(await req.workspace.explorer.previewTrash(req.body.days)));
app.post('/api/explorer/trash/purge',async(req,res)=>res.json(await req.workspace.explorer.purgeTrash(req.body.token)));
app.get('/api/explorer/search',async(req,res)=>res.json(await req.workspace.explorer.search(req.query.folder,req.query.query)));
app.post('/api/explorer',async(req,res)=>res.json(await req.workspace.explorer.manage(req.body)));
app.post('/api/images',express.raw({type:'application/octet-stream',limit:MAX_IMAGE_BYTES}),async(req,res)=>{
  res.json(await imageStore(req.workspace).store(req.query.document,req.query.name,req.body));
});
app.get('/api/images',async(req,res)=>{
  if(!req.query.workspace||req.query.workspace!==req.workspace.id)return res.status(409).json({error:'图片所属写作空间已变化。'});
  const image=await imageStore(req.workspace).read(req.query.document,req.query.path);
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
  res.type(image.mime).send(image.buffer);
});
app.get("/api/file", async (req, res) =>
  res.json(await req.workspace.files.read(req.query.path)),
);
app.post("/api/file", async (req, res) => res.json(await req.workspace.files.save(req.body)));
app.post("/api/folder", async (req, res) => {
  await req.workspace.files.folder(req.body.path);
  res.json({ ok: true });
});
app.post("/api/rename", async (req, res) =>
  res.json(await req.workspace.files.rename(req.body.from, req.body.to, req.body.baseline)),
);
app.get("/api/config", (_req, res) => res.json(modelSettings.read()));
app.post("/api/config", async (req, res) => res.json(await modelSettings.update(req.body)));
app.post("/api/model-services", async (req, res) => res.json(await modelSettings.upsert(req.body)));
app.post("/api/model-services/remove", async (req, res) => res.json(await modelSettings.remove(req.body)));
app.post("/api/generate", async (req, res) => {
  const reasoning=reasoningOptions(req.body.reasoningEffort);
  const route = modelSettings.resolve(req.body.selection);
  const messages = req.body.messages;
  if (
    !Array.isArray(messages) ||
    messages.length > 160 ||
    messages.some(
      (m) =>
        !["system", "user", "assistant"].includes(m.role) ||
        typeof m.content !== "string",
    ) ||
    JSON.stringify(messages).length > 120000
  )
    return res.status(400).json({
      error:
        "本轮上下文无效或过长（上限 12 万字符），请缩小当前文档或新开会话。",
    });
  const abort = new AbortController();
  res.on("close", () => abort.abort());
  const timeout = setTimeout(() => abort.abort(), 120000);
  let headersSent = false;
  const emit = (event, data) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  try {
    const url = /\/chat\/completions$/.test(route.endpoint)
      ? route.endpoint
      : route.endpoint + "/chat/completions";
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(route.key ? { Authorization: `Bearer ${route.key}` } : {}),
      },
      body: JSON.stringify({ model: route.model, messages, stream: true,...reasoning }),
      signal: abort.signal,
    });
    if (!upstream.ok)
      throw new Error(
        `模型端点返回 HTTP ${upstream.status}。请检查地址、模型、凭据或额度。${Object.keys(reasoning).length?'也可将推理强度调回默认后重试。':''}`,
      );
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    headersSent = true;
    if (
      !(upstream.headers.get("content-type") || "").includes(
        "text/event-stream",
      )
    ) {
      const value = await upstream.json();
      const text = value.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text)
        throw new Error("端点未返回可用正文。");
      emit("chunk", text);
      emit("done", {});
      return res.end();
    }
    const decoder = new TextDecoder();
    let buffer = "";
    let received = false;
    let finished = false;
    function parse(block) {
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!data) return;
      if (data === "[DONE]") {
        finished = true;
        return;
      }
      const value = JSON.parse(data);
      if (value.error) throw new Error("模型端点返回错误，请检查配置后重试。");
      const delta = value.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) {
        received = true;
        emit("chunk", delta);
      }
      if (value.choices?.[0]?.finish_reason) {
        if (value.choices[0].finish_reason !== "stop")
          throw new Error(
            `生成未完整结束（${value.choices[0].finish_reason}），请重试。`,
          );
        finished = true;
      }
    }
    for await (const chunk of upstream.body) {
      buffer = (buffer + decoder.decode(chunk, { stream: true })).replace(
        /\r\n/g,
        "\n",
      );
      let i;
      while ((i = buffer.indexOf("\n\n")) >= 0) {
        parse(buffer.slice(0, i));
        buffer = buffer.slice(i + 2);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) parse(buffer);
    if (!received || !finished)
      throw new Error("模型响应中断或未返回正文，未生成可采纳建议。");
    emit("done", {});
    res.end();
  } catch (error) {
    if (!res.destroyed) {
      const message =
        error.name === "AbortError"
          ? "请求已停止或超时。"
          : error.message === "fetch failed"
            ? "无法连接模型端点，请检查本机网络及端点地址。"
            : error.message;
      if (headersSent) {
        emit("error", message);
        res.end();
      } else res.status(502).json({ error: message });
    }
  } finally {
    clearTimeout(timeout);
  }
});
app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在。" }));
app.use((error, _req, res, _next) => {
  res
    .status(
      error.status ||
        (error.code === "ENOENT" ? 404 : error.code === "EEXIST" ? 409 : 500),
    )
    .json({
      error:
        error.code === "ENOENT"
          ? "文件不存在，请刷新文件列表。"
          : error.code === "EEXIST"
            ? "同名文件已存在，已阻止覆盖。"
            : error.message || "本地操作失败。",
    });
});
if (process.argv.includes("--production")) {
  app.use(express.static(path.join(project, "dist")));
  app.get("/", (_req, res) =>
    res.sendFile(path.join(project, "dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root: project,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const server = app.listen(port, "127.0.0.1", () => {
  port = server.address().port;
  console.log(`HIVE ready: http://127.0.0.1:${port}\nDocuments: ${spaces.read().root}`);
  if (process.send) process.send({ type: 'hive-ready', port });
});
function shutdown() { server.close(() => process.exit(0)); server.closeAllConnections(); }
if (process.send) {
  process.on('message', message => { if (message?.type === 'hive-shutdown') shutdown(); });
  process.on('disconnect', shutdown);
}
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `端口 ${port} 已使用，请复用已运行的 HIVE，或设置 HIVE_PORT。`
      : error.message,
  );
  process.exit(1);
});
