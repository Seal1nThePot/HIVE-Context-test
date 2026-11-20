import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer as createHttpServer} from 'node:http';
import {createRequire} from 'node:module';
import {fork, spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = fileURLToPath(import.meta.url);
const out = path.resolve(process.env.HIVE_WINDOW_FIND_EVIDENCE || path.join(root, '.runtime/checks/window-find'));
const require = createRequire(import.meta.url);
const alpha = 'Alpha.md', beta = 'Beta.md';
const original = 'Alpha original content.';
const draft = 'Only the unsaved Alpha draft carries needle.';
const instruction = '查找 needle';
const plain = '继续普通对话';
const alphaRow = '[data-path="Alpha.md"]';
const betaRow = '[data-path="Beta.md"]';
const composer = 'textarea[aria-label="向 AI 描述想法或修改要求"]';
const searchTitle = '[data-lock-panel="search"] b';
const markChip = '[aria-label="移除查找替换窗口标注"]';

async function verify(port, profile) {
  const {app, BrowserWindow} = require('electron');
  app.setPath('userData', path.join(profile, 'electron'));
  app.disableHardwareAcceleration();
  await app.whenReady();
  const win = new BrowserWindow({
    show: false, focusable: false, skipTaskbar: true, width: 1600, height: 1000,
    webPreferences: {offscreen: true, contextIsolation: true, backgroundThrottling: false},
  });
  const cdp = win.webContents.debugger;
  const js = expression => win.webContents.executeJavaScript(expression);
  const query = selector => 'document.querySelector(' + JSON.stringify(selector) + ')';
  const checks = [];
  const wait = async (expression, label = expression) => {
    const until = Date.now() + 6000;
    do {
      if (await js(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 30));
    } while (Date.now() < until);
    throw Error('Timed out: ' + label);
  };
  const check = (name, passed) => {
    checks.push({name, passed: !!passed});
    assert.ok(passed, name);
    console.log('PASS ' + name);
  };
  const click = selector => js(query(selector) + '.click()');
  const visible = selector => query(selector) + '?.checkVisibility({checkVisibilityCSS:true})';
  function insert(text) { return cdp.sendCommand('Input.insertText', {text}); }
  async function ctrlClick(selector) {
    const point = await js('(()=>{const r=' + query(selector) + '.getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()');
    for (const [type, buttons] of [['mousePressed', 1], ['mouseReleased', 0]])
      await cdp.sendCommand('Input.dispatchMouseEvent', {type, ...point, buttons, modifiers: 2, button: 'left', clickCount: 1});
  }
  async function key(selector, key, ctrlKey = true) {
    await js(query(selector) + '.focus()');
    await js(query(selector) + '.dispatchEvent(new KeyboardEvent("keydown",' + JSON.stringify({key, ctrlKey, bubbles: true, cancelable: true}) + '))');
  }
  async function showChat() {
    if (!await js(visible(composer))) await click('[aria-label="打开 AI 面板"]');
    await wait(visible(composer), 'chat composer');
  }
  async function send(text) {
    await js(query(composer) + '.focus()');
    await js(query(composer) + '.select()');
    await insert(text);
    await click('button[aria-label="发送给 AI"]');
  }
  try {
    cdp.attach('1.3');
    await win.loadURL('http://127.0.0.1:' + port);
    await wait(visible(alphaRow), 'Alpha in file tree');
    await click(alphaRow);
    const editor = '.document-pane.active-editor .cm-content';
    await wait(query(editor) + '?.textContent.includes(' + JSON.stringify(original) + ')', 'Alpha editor');
    await js('(()=>{const e=' + query(editor) + ';e.focus();getSelection().collapse(e.lastChild.firstChild,e.lastChild.firstChild.length);})()');
    await insert('\n' + draft);
    await wait(query(editor) + '?.textContent.includes(' + JSON.stringify(draft) + ')', 'unsaved Alpha edit');
    await key(editor, 'f');
    await wait(visible(searchTitle), 'Find and replace title');
    await ctrlClick(searchTitle);
    await showChat();
    check('The marked search window targets Alpha', await js(query(markChip) + '?.title==="Alpha.md"'));

    await key(betaRow, 'Enter');
    await wait(query(editor) + '?.textContent.includes("needle in Beta")', 'Beta active in a separate tab');
    await wait(query('.find-target') + '?.textContent==="Beta.md"', 'Search panel follows the active editor');
    check('Switching the live search panel to Beta keeps the original Alpha mark', await js(query(markChip) + '?.title==="Alpha.md"'));
    await send(instruction);
    await wait('!!document.querySelector(".messages .assistant")?.textContent.includes(' + JSON.stringify(draft) + ')', 'bound search result in chat');
    const response = await js('document.querySelector(".messages .assistant").textContent');
    check('Result reports Alpha and the unsaved matching line', response.includes(alpha) && response.includes('第 2 行') && !response.includes(beta));
    check('Completed search removes the sent window mark', !(await js('!!' + query(markChip))));

    await ctrlClick(searchTitle);
    check('Marking the panel again binds its current Beta target', await js(query(markChip) + '?.title==="Beta.md"'));
    await click('[aria-label="关闭Beta.md标签页"]');
    await wait(query(editor) + '?.textContent.includes(' + JSON.stringify(draft) + ')', 'Alpha becomes active after Beta closes');
    await send('测一下失效标注');
    await wait('document.body.textContent.includes("标注的笔记已关闭或变更")', 'stale marker warning');
    check('A closed target warns and keeps the unsent instruction', await js(query(composer) + '?.value==="测一下失效标注"'));
    await click(markChip);
    await send(plain);
    await wait('[...document.querySelectorAll(".messages .assistant")].some(el=>el.textContent.includes("Plain chat fixture"))', 'standard chat response');
    check('Removing the mark preserves the ordinary chat flow', true);
  } catch (error) {
    checks.push({name: 'harness', passed: false, error: error.stack});
    console.error(error);
  } finally {
    await fs.writeFile(path.join(out, 'frontend.json'), JSON.stringify(checks, null, 2));
    win.destroy();
    app.exit(checks.every(check => check.passed) ? 0 : 1);
  }
}

async function run() {
  await fs.mkdir(out, {recursive: true});
  const profile = await fs.mkdtemp(path.join(out, 'window-find-profile-'));
  const state = path.join(profile, 'state'), docs = path.join(profile, 'documents');
  await Promise.all([fs.mkdir(state), fs.mkdir(docs), fs.mkdir(path.join(profile, 'electron'))]);
  await Promise.all([
    fs.writeFile(path.join(state, 'workspace.json'), JSON.stringify({root: docs, autoSave: false, revision: 0})),
    fs.writeFile(path.join(docs, alpha), original),
    fs.writeFile(path.join(docs, beta), 'needle in Beta on the first line.'),
  ]);
  const modelRequests = [];
  const model = createHttpServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    modelRequests.push(body);
    if (body.tools) {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({choices: [{finish_reason: 'tool_calls', message: {tool_calls: [{
        id: 'test', type: 'function', function: {name: 'find_note', arguments: '{"query":"needle"}'},
      }]}}]}));
    } else {
      res.writeHead(200, {'Content-Type': 'text/event-stream'});
      res.end('data: {"choices":[{"delta":{"content":"Plain chat fixture"}}]}\n\ndata: [DONE]\n\n');
    }
  });
  await new Promise((resolve, reject) => { model.once('error', reject); model.listen(0, '127.0.0.1', resolve); });
  const backendPath = path.resolve(process.env.HIVE_WINDOW_FIND_SERVER || path.join(root, 'server/index.mjs'));
  const backend = fork(backendPath, ['--production'], {
    cwd: path.dirname(path.dirname(backendPath)), silent: true, windowsHide: true,
    env: {...process.env, HIVE_PORT: '0', HIVE_STATE_DIR: state, HIVE_DOCUMENTS: docs, HIVE_API_KEY: ''},
  });
  backend.stdout.resume();
  backend.stderr.pipe(process.stderr);
  let vite;
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Backend startup timed out')), 12000);
      backend.once('error', reject);
      backend.on('message', message => { if (message?.type === 'hive-ready') { clearTimeout(timer); resolve(message.port); } });
    });
    const base = 'http://127.0.0.1:' + port;
    const config = await fetch(base + '/api/config', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({endpoint: 'http://127.0.0.1:' + model.address().port + '/v1', model: 'find-test', key: 'test-key', demo: false}),
    });
    assert.ok(config.ok, 'Isolated model config');
    const {createServer} = await import('vite');
    vite = await createServer({root, cacheDir: path.join(profile, '.vite'), server: {
      host: '127.0.0.1', port: 0, hmr: false,
      proxy: {'/api': {target: base, changeOrigin: true, configure(proxy) { proxy.on('proxyReq', req => req.setHeader('origin', base)); }}},
    }});
    await vite.listen();
    const env = {...process.env};
    delete env.ELECTRON_RUN_AS_NODE;
    const flags = ['--user-data-dir=' + path.join(profile, 'electron')];
    if (process.env.HIVE_TEST_ELECTRON_NO_SANDBOX === '1') flags.push('--no-sandbox');
    const child = spawn((await import('electron')).default,
      [...flags, entry, '--worker', vite.httpServer.address().port, profile], {cwd: root, env, windowsHide: true, stdio: 'inherit'});
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(Error('Hidden Electron timed out')); }, 75000);
      child.once('error', reject);
      child.once('exit', code => { clearTimeout(timer); resolve(code); });
    });
    assert.equal(code, 0, 'See frontend.json');
    assert.equal(modelRequests.length, 2);
    assert.deepEqual(modelRequests[0].tools.map(tool => tool.function.name), ['find_note']);
    assert.ok(!JSON.stringify(modelRequests[0]).includes(draft));
    assert.ok(!JSON.stringify(modelRequests[0]).includes(alpha));
    assert.equal(modelRequests[1].tools, undefined);
    assert.equal(await fs.readFile(path.join(docs, alpha), 'utf8'), original);
    assert.equal(await fs.readFile(path.join(docs, beta), 'utf8'), 'needle in Beta on the first line.');
    await fs.writeFile(path.join(out, 'server.json'), JSON.stringify({
      modelToolOnly: ['find_note'], modelReceivedNoSearchTargetTextOrPath: true, ordinaryChatUsesNoTools: true, bothDiskFilesUnchanged: true,
    }, null, 2));
  } finally {
    if (vite) await vite.close();
    if (backend.exitCode === null && backend.signalCode === null)
      await new Promise(resolve => { backend.once('exit', resolve); backend.kill(); });
    model.closeAllConnections();
    await new Promise(resolve => model.close(resolve));
    const resolved = await fs.realpath(profile);
    assert.equal(path.dirname(resolved), await fs.realpath(out));
    assert.ok(path.basename(resolved).startsWith('window-find-profile-'));
    await fs.rm(resolved, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
  }
}

const worker = process.argv.indexOf('--worker');
if (worker !== -1)
  void verify(process.argv[worker + 1], process.argv[worker + 2]).catch(error => { console.error(error); require('electron').app.exit(1); });
else
  void run().catch(error => { console.error(error); process.exitCode = 1; });
