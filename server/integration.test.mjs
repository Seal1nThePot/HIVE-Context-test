import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { annotationMessages } from "../src/features/annotations/annotations.ts";
let mock,
  child,
  temp,
  base,
  mockBase,
  reply = "valid",
  lastBody,
  lastAuthorization,
  lastPath,
  aborted = false;
const listen = (server) =>
  new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server.address().port)),
  );
async function post(route, body) {
  return fetch(base + route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeAll(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "hive-integration-"));
  mock = createServer(async (req, res) => {
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    lastBody = JSON.parse(Buffer.concat(buffers).toString());
    lastAuthorization = req.headers.authorization;
    lastPath = req.url;
    if (reply === "http-error") {
      res.writeHead(401);
      return res.end("secret provider detail that should not appear");
    }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.flushHeaders();
    if (reply === "slow") {
      res.on("close", () => {
        aborted = true;
      });
      return;
    }
    const text = JSON.stringify({
      text: "一段完整的短文。",
      reason: "符合本轮要求。",
    });
    const frame = JSON.stringify({ choices: [{ delta: { content: text } }] });
    // Deliberately split CRLF between writes to exercise incremental framing.
    res.write("data: " + frame + "\r");
    await new Promise((resolve) => setTimeout(resolve, 12));
    res.write("\n\r");
    await new Promise((resolve) => setTimeout(resolve, 12));
    res.write("\n");
    if (reply !== "truncated") res.write("data: [DONE]\r\n\r\n");
    res.end();
  });
  mockBase = `http://127.0.0.1:${await listen(mock)}/v1`;
  const reserve = createServer();
  const port = await listen(reserve);
  await new Promise((resolve) => reserve.close(resolve));
  base = `http://127.0.0.1:${port}`;
  const project = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  child = spawn(process.execPath, ["server/index.mjs", "--production"], {
    cwd: project,
    windowsHide: true,
    env: {
      ...process.env,
      HIVE_PORT: String(port),
      HIVE_DOCUMENTS: path.join(temp, "documents"),
      HIVE_STATE_DIR: path.join(temp, "state"),
    },
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Test server did not start")),
      10000,
    );
    child.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("HIVE ready")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code) reject(new Error("Test server exited " + code));
    });
  });
}, 15000);
beforeEach(async () => {
  reply = "valid";
  aborted = false;
  const response = await post("/api/config", {
    endpoint: mockBase,
    model: "local-contract-stub",
    demo: false,
    continuationLimit: 100,
    key: "test-only-key",
  });
  expect(response.ok).toBe(true);
});
afterAll(async () => {
  if (child) {
    child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", resolve);
    });
  }
  if (mock) {
    mock.closeAllConnections();
    await new Promise((resolve) => mock.close(resolve));
  }
  if (
    temp &&
    path.dirname(temp) === os.tmpdir() &&
    path.basename(temp).startsWith("hive-integration-")
  )
    await fs.rm(temp, { recursive: true, force: true });
});
describe("HTTP model and local service contract", () => {
  it('routes the explicitly selected service with its own key and rejects disabled services',async()=>{
    const create=async(name,endpoint,key)=>{
      const before=await (await fetch(base+'/api/config')).json();
      const response=await post('/api/model-services',{revision:before.revision,key,service:{name,endpoint,enabled:true,models:[{id:'shared-model',name}]}});
      expect(response.ok).toBe(true);const updated=await response.json();
      return updated.services.find(service=>service.name===name);
    };
    const a=await create('HTTP service A',mockBase,'isolated-key-A');
    const b=await create('HTTP service B',mockBase.replace('/v1','/second/v1'),'isolated-key-B');
    await post('/api/config',{demo:false,selection:{serviceId:b.id,modelId:'shared-model'}});
    const bResponse=await post('/api/generate',{messages:[{role:'user',content:'connection contract only'}]});
    await bResponse.text();expect(bResponse.ok).toBe(true);expect(lastAuthorization).toBe('Bearer isolated-key-B');expect(lastPath).toBe('/second/v1/chat/completions');
    const aResponse=await post('/api/generate',{selection:{serviceId:a.id,modelId:'shared-model'},messages:[{role:'user',content:'explicit request snapshot'}]});
    await aResponse.text();expect(aResponse.ok).toBe(true);expect(lastAuthorization).toBe('Bearer isolated-key-A');expect(lastPath).toBe('/v1/chat/completions');
    const current=await (await fetch(base+'/api/config')).json();
    await post('/api/model-services',{revision:current.revision,service:{...a,enabled:false}});
    const rejected=await post('/api/generate',{selection:{serviceId:a.id,modelId:'shared-model'},messages:[{role:'user',content:'must not reach upstream'}]});
    expect(rejected.status).toBe(400);expect((await rejected.json()).error).toContain('已停用');
    expect(lastBody.messages[0].content).toBe('explicit request snapshot');
    const disk=await fs.readFile(path.join(temp,'state/model.json'),'utf8');expect(disk).not.toContain('isolated-key');
  });
  it("persists annotations independently and prevents stale metadata replacement", async () => {
    await post("/api/file", {
      path: "annotations.md",
      text: "第一句。第二句。",
      baseline: null,
    });
    const initial = await (
      await fetch(base + "/api/annotations?source=document&file=annotations.md")
    ).json();
    expect(initial.revision).toBe(0);
    const annotation = {
      id: "one",
      source: "document",
      file: "annotations.md",
      from: 0,
      to: 4,
      original: "第一句。",
      note: "只处理这句",
      stale: false,
      createdAt: "2026-11-15T00:00:00Z",
    };
    const saved = await post("/api/annotations", {
      source: "document",
      file: "annotations.md",
      revision: 0,
      fingerprint: "a".repeat(64),
      items: [annotation],
    });
    expect(saved.ok).toBe(true);
    const conflict = await post("/api/annotations", {
      source: "document",
      file: "annotations.md",
      revision: 0,
      fingerprint: "a".repeat(64),
      items: [],
    });
    expect(conflict.status).toBe(409);
    const loaded = await (
      await fetch(base + "/api/annotations?source=document&file=annotations.md")
    ).json();
    expect(loaded.items[0].note).toBe("只处理这句");
    expect(loaded.revision).toBe(1);
    expect(
      (await (await fetch(base + "/api/file?path=annotations.md")).json()).text,
    ).toBe("第一句。第二句。");
  });
  it("isolates scratch annotations from document annotations and validates ranges", async () => {
    const annotation = {
      id: "scratch-one",
      source: "scratch",
      file: "自由草稿",
      from: 0,
      to: 2,
      original: "草稿",
      note: "一个问题",
      stale: false,
      createdAt: "2026-11-15T00:00:00Z",
    };
    const saved = await post("/api/annotations", {
      source: "scratch",
      file: "自由草稿",
      revision: 0,
      fingerprint: "b".repeat(64),
      items: [annotation],
    });
    expect(saved.ok).toBe(true);
    const malformed = await post("/api/annotations", {
      source: "scratch",
      file: "自由草稿",
      revision: 1,
      fingerprint: "b".repeat(64),
      items: [{ ...annotation, to: 100 }],
    });
    expect(malformed.status).toBe(400);
    expect(
      (await (await fetch(base + "/api/annotations?source=scratch")).json())
        .items[0].original,
    ).toBe("草稿");
  });
  it("forwards a two-annotation request through the actual model adapter", async () => {
    const sample = {
      source: "document",
      file: "test.md",
      from: 0,
      to: 2,
      original: "片段",
      note: "第一条备注",
    };
    const messages = annotationMessages(
      [
        { ...sample, id: "a" },
        { ...sample, id: "b", note: "第二条备注" },
      ],
      "逐条讨论",
      [],
    );
    const response = await post("/api/generate", { messages });
    expect(await response.text()).toContain("event: done");
    expect(lastBody.messages).toEqual(messages);
    expect(lastBody.messages.at(-1).content).toContain("第二条备注");
  });
  it("persists a custom continuation limit and rejects invalid values", async () => {
    const response = await post("/api/config", {
      endpoint: mockBase,
      model: "local-contract-stub",
      demo: false,
      continuationLimit: 30,
    });
    expect(response.ok).toBe(true);
    expect((await response.json()).continuationLimit).toBe(30);
    expect(
      JSON.parse(await fs.readFile(path.join(temp, "state/model.json"), "utf8"))
        .continuationLimit,
    ).toBe(30);
    const invalid = await post("/api/config", {
      endpoint: mockBase,
      model: "local-contract-stub",
      demo: false,
      continuationLimit: 0,
    });
    expect(invalid.status).toBe(400);
    expect(
      (await (await fetch(base + "/api/config")).json()).continuationLimit,
    ).toBe(30);
  });
  it("persists scratch as a workspace Markdown file and rejects a stale autosave", async () => {
    const initial = await (await fetch(base + "/api/scratch")).json();
    expect(initial.text).toBe("");
    expect(initial.path).toBe("自由草稿.md");
    expect(initial.hash).toMatch(/^[a-f0-9]{64}$/);
    const saved = await post("/api/scratch", {
      text: "独立草稿。",
      baseline: initial.hash,
    });
    expect(saved.ok).toBe(true);
    const loaded = await (await fetch(base + "/api/scratch")).json();
    expect(loaded.text).toBe("独立草稿。");
    const stale = await post("/api/scratch", {
      text: "过时覆盖",
      baseline: null,
    });
    expect(stale.status).toBe(409);
    expect((await (await fetch(base + "/api/scratch")).json()).text).toBe(
      "独立草稿。",
    );
    expect(await fs.readFile(path.join(temp, "documents/自由草稿.md"), "utf8")).toBe(
      "独立草稿。",
    );
    expect((await (await fetch(base + "/api/file?path=" + encodeURIComponent("自由草稿.md"))).json()).text).toBe("独立草稿。");
  });
  it("preserves a scratch file's CRLF and BOM when saving through the scratch editor", async () => {
    const first = await (await fetch(base + "/api/scratch")).json();
    const formatted = await (await post("/api/file", {
      path: "自由草稿.md", text: "# 草稿\n\n原有想法。\n", baseline: first.hash, eol: "CRLF", bom: true,
    })).json();
    const saved = await post("/api/scratch", {text:"# 草稿\n\n新的想法。\n",baseline:formatted.hash});
    expect(saved.ok).toBe(true);
    expect(await fs.readFile(path.join(temp,"documents/自由草稿.md"),"utf8")).toBe("\uFEFF# 草稿\r\n\r\n新的想法。\r\n");
  });
  it("creates, changes, reorders and deletes independent outline nodes without touching the body", async () => {
    const file = "independent-outline.md", text = "# 原文\n\n正文保持原样。";
    await post("/api/file", {path:file,text,baseline:null});
    const read = async () => (await fetch(base + "/api/writing-outline?file=" + file)).json();
    expect(await read()).toEqual({revision:0,initialized:false,nodes:[]});
    const a = {id:"a",title:"第一节",description:"先举例",level:2,targetHeading:null};
    const b = {...a,id:"b",title:"第二节"};
    expect((await post("/api/writing-outline",{file,nodes:[a,b],revision:0})).ok).toBe(true);
    expect((await post("/api/writing-outline",{file,nodes:[b,{...a,title:"改名",description:"再解释"}],revision:1})).ok).toBe(true);
    expect((await read()).nodes.map(node=>node.title)).toEqual(["第二节","改名"]);
    expect((await post("/api/writing-outline",{file,nodes:[a],revision:1})).status).toBe(409);
    expect((await post("/api/writing-outline",{file,nodes:[],revision:2})).ok).toBe(true);
    expect(await read()).toEqual({revision:3,initialized:true,nodes:[]});
    expect((await (await fetch(base+"/api/file?path="+file)).json()).text).toBe(text);
    expect((await post("/api/writing-outline",{file,nodes:[null],revision:3})).status).toBe(400);
    expect((await post("/api/writing-outline",{file,nodes:[a,a],revision:3})).status).toBe(400);
    expect((await post("/api/writing-outline",{file,nodes:[{...a,title:"换\n行"}],revision:3})).status).toBe(400);
  });
  it("keeps independent writing descriptions for each document and serializes concurrent saves", async () => {
    expect(
      (
        await post("/api/file", {
          path: "outline.md",
          text: "# 标题\n\n## 章节",
          baseline: null,
        })
      ).ok,
    ).toBe(true);
    const results = await Promise.all([
      post("/api/outline", {
        file: "outline.md",
        key: "node-a",
        description: "说明观点A。",
      }),
      post("/api/outline", {
        file: "outline.md",
        key: "node-b",
        description: "用具体材料说明B。",
      }),
    ]);
    expect(results.every((response) => response.ok)).toBe(true);
    const plans = await (
      await fetch(base + "/api/outline?file=outline.md")
    ).json();
    expect(plans).toEqual({
      "node-a": "说明观点A。",
      "node-b": "用具体材料说明B。",
    });
    expect(
      (await (await fetch(base + "/api/file?path=outline.md")).json()).text,
    ).toBe("# 标题\n\n## 章节");
  });
  it("reports the owning project and process for launcher readiness checks", async () => {
    const response = await fetch(base + "/api/health");
    expect(response.status).toBe(200);
    const health = await response.json();
    expect(health.app).toBe("hive-writing-prototype");
    expect(health.ready).toBe(true);
    expect(health.pid).toBe(child.pid);
    expect(health.project).toBe(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
    );
  });
  it("streams valid output and forwards latest supplied messages", async () => {
    const messages = [
      { role: "system", content: "Return JSON" },
      { role: "user", content: "最新手改正文" },
    ];
    const response = await post("/api/generate", { messages });
    const text = await response.text();
    expect(text).toContain("event: chunk");
    expect(text).toContain("一段完整的短文。");
    expect(text).toContain("event: done");
    expect(text).not.toContain("event: error");
    expect(lastBody.messages).toEqual(messages);
    expect(lastBody.model).toBe("local-contract-stub");
  });
  it("reports incomplete streams as errors without a successful done event", async () => {
    reply = "truncated";
    const response = await post("/api/generate", {
      messages: [{ role: "user", content: "test" }],
    });
    const text = await response.text();
    expect(text).toContain("event: error");
    expect(text).not.toContain("event: done");
  });
  it("handles provider errors without returning provider response details", async () => {
    reply = "http-error";
    const response = await post("/api/generate", {
      messages: [{ role: "user", content: "test" }],
    });
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("secret provider detail");
  });
  it("does not persist or return API keys", async () => {
    const response = await fetch(base + "/api/config"),
      data = await response.json();
    expect(data.hasKey).toBe(true);
    expect(data.key).toBeUndefined();
    expect(
      await fs.readFile(path.join(temp, "state/model.json"), "utf8"),
    ).not.toContain("test-only-key");
  });
  it("aborts upstream work when the client stops the request", async () => {
    reply = "slow";
    const abort = new AbortController();
    const responsePromise = fetch(base + "/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "test" }] }),
      signal: abort.signal,
    });
    // Wait for the actual upstream connection, rather than guessing the model latency.
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("upstream not reached")),
        3000,
      );
      mock.once("request", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    abort.abort();
    await expect(responsePromise).rejects.toThrow();
    await expect.poll(() => aborted, { timeout: 3000 }).toBe(true);
  });
  it("rejects unexpected origins and oversized context", async () => {
    const cross = await fetch(base + "/api/file", {
      method: "POST",
      headers: {
        Origin: "https://unrelated.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(cross.status).toBe(403);
    const big = await post("/api/generate", {
      messages: [{ role: "user", content: "字".repeat(120001) }],
    });
    expect(big.status).toBe(400);
  });
  it("round trips a file through the HTTP API and prevents stale saves", async () => {
    const created = await post("/api/file", {
      path: "http.md",
      text: "# 正文\n",
      baseline: null,
    });
    expect(created.ok).toBe(true);
    const loaded = await (await fetch(base + "/api/file?path=http.md")).json();
    expect(loaded.text).toBe("# 正文\n");
    expect(
      (
        await post("/api/file", {
          path: "http.md",
          text: "最新正文",
          baseline: loaded.hash,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await post("/api/file", {
          path: "http.md",
          text: "旧基线覆盖",
          baseline: loaded.hash,
        })
      ).status,
    ).toBe(409);
  });
  it("supports explorer create, rename, soft delete and restore through workspace-bound APIs",async()=>{
    const created=await(await post('/api/explorer',{action:'create',type:'file'})).json();
    const renamed=await post('/api/explorer',{action:'rename',path:created.path,name:'文件整理验收.md'});expect(renamed.ok).toBe(true);
    const moved=await(await post('/api/explorer',{action:'trash',path:'文件整理验收.md'})).json();
    expect((await(await fetch(base+'/api/explorer/trash')).json()).some(item=>item.id===moved.id)).toBe(true);
    expect((await post('/api/explorer',{action:'restore',id:moved.id})).ok).toBe(true);
    expect((await fetch(base+'/api/file?path='+encodeURIComponent('文件整理验收.md'))).ok).toBe(true);
  });
  it("switches folders through HTTP, synchronizes external files, and rejects stale workspace writes",async()=>{
    const original=await(await fetch(base+'/api/workspace')).json();
    const other=path.join(temp,'other-workspace');await fs.mkdir(other);
    await fs.writeFile(path.join(other,'outside.md'),'# 外部文件\n');
    try{
      const changedResponse=await post('/api/workspace',{root:other,revision:original.revision});
      expect(changedResponse.ok).toBe(true);
      const changed=await changedResponse.json();
      const sync=await(await post('/api/workspace/sync',{paths:['outside.md','deleted.md']})).json();
      expect(sync.entries.some(entry=>entry.path==='outside.md')).toBe(true);
      expect(sync.files[0].text).toBe('# 外部文件\n');expect(sync.files[1].error).toContain('删除');
      const unchanged=await(await post('/api/workspace/sync',{paths:['outside.md'],baselines:{'outside.md':sync.files[0].hash}})).json();
      expect(unchanged.files[0]).toEqual({path:'outside.md',hash:sync.files[0].hash,unchanged:true});
      const before=await fs.stat(path.join(other,'outside.md'));
      await fs.writeFile(path.join(other,'outside.md'),'# 外部更新\n');
      await fs.utimes(path.join(other,'outside.md'),before.atime,before.mtime);
      const updated=await(await post('/api/workspace/sync',{paths:['outside.md'],baselines:{'outside.md':sync.files[0].hash}})).json();
      expect(updated.files[0].hash).not.toBe(sync.files[0].hash);
      expect(updated.files[0].text).toBe('# 外部更新\n');
      await fs.writeFile(path.join(other,'format.md'),'\uFEFF第一行\r\n第二行\r\n');
      const formatted=(await(await post('/api/workspace/sync',{paths:['format.md']})).json()).files[0];
      expect(formatted).toMatchObject({text:'第一行\n第二行\n',eol:'CRLF',bom:true});
      expect((await(await post('/api/workspace/sync',{paths:['format.md'],baselines:{'format.md':formatted.hash}})).json()).files[0]).toEqual({path:'format.md',hash:formatted.hash,unchanged:true});
      const stale=await fetch(base+'/api/file',{method:'POST',headers:{'Content-Type':'application/json','X-Hive-Workspace':original.id},body:JSON.stringify({path:'outside.md',text:'stale tab',baseline:updated.files[0].hash})});
      const staleExplorer=await fetch(base+'/api/explorer',{method:'POST',headers:{'Content-Type':'application/json','X-Hive-Workspace':original.id},body:JSON.stringify({action:'trash',path:'outside.md'})});
      expect(staleExplorer.status).toBe(409);expect(stale.status).toBe(409);expect(await fs.readFile(path.join(other,'outside.md'),'utf8')).toBe('# 外部更新\n');
      expect((await post('/api/workspace',{root:other,revision:original.revision})).status).toBe(409);
      const valid=await fetch(base+'/api/file',{method:'POST',headers:{'Content-Type':'application/json','X-Hive-Workspace':changed.id},body:JSON.stringify({path:'outside.md',text:'current tab',baseline:updated.files[0].hash})});
      expect(valid.ok).toBe(true);
    }finally{
      const current=await(await fetch(base+'/api/workspace')).json();
      await post('/api/workspace',{root:original.root,autoSave:original.autoSave,revision:current.revision});
    }
  });

});
