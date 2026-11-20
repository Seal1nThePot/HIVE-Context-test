import { fileProbe } from './file-probe.mjs';

const scratchPath = '自由草稿.md';

export function registerDocumentRoutes(app, spaces) {
  let probeWorkspace;
  let activeProbe;

  app.post('/api/workspace/sync', async (req, res) => {
    const { paths, baselines, treeVersion } = req.body;
    if (!Array.isArray(paths) || paths.length > 100 || paths.some(path => typeof path !== 'string'))
      return res.status(400).json({ error: '同步文件列表无效。' });

    if (probeWorkspace !== req.workspace) {
      activeProbe?.clear();
      probeWorkspace = req.workspace;
      activeProbe = fileProbe(req.workspace.files);
    }
    const probe = activeProbe;
    const unique = [...new Set(paths)];
    const files = new Array(unique.length);
    probe.retain(unique);

    // Bound concurrent disk reads and keep the response in request order.
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, unique.length) }, async () => {
      while (cursor < unique.length) {
        const index = cursor++;
        const path = unique[index];
        const knownHash = baselines && typeof baselines === 'object' && Object.hasOwn(baselines, path)
          ? baselines[path] : undefined;
        try {
          files[index] = await probe.read(path, knownHash);
        } catch (error) {
          files[index] = {
            path,
            error: error.code === 'ENOENT' ? '文件已在磁盘删除或移动。' : error.message,
          };
        }
      }
    }));
    const snapshot = await req.workspace.files.snapshot({ knownVersion: treeVersion });
    res.json({ workspace: spaces.read(), ...snapshot, files });
  });

  app.get('/api/tree', async (req, res) => {
    const snapshot = await req.workspace.files.snapshot({ force: req.query.refresh === '1' });
    res.json({ root: req.workspace.root, ...snapshot });
  });
  app.get('/api/file', async (req, res) =>
    res.json(await req.workspace.files.read(req.query.path)),
  );
  app.post('/api/file', async (req, res) =>
    res.json(await req.workspace.files.save(req.body)),
  );
  app.post('/api/folder', async (req, res) => {
    await req.workspace.files.folder(req.body.path);
    res.json({ ok: true });
  });
  app.post('/api/rename', async (req, res) => {
    const { from, to, baseline } = req.body;
    res.json(await req.workspace.files.rename(from, to, baseline));
  });

  app.get('/api/scratch', async (req, res) => {
    try {
      const { text, hash } = await req.workspace.files.read(scratchPath);
      res.json({ text, hash, path: scratchPath });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      res.json({ text: '', hash: null, path: scratchPath });
    }
  });
  app.post('/api/scratch', async (req, res) => {
    const { text, baseline } = req.body;
    const { eol, bom } = await req.workspace.files.read(scratchPath).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return { eol: 'LF', bom: false };
    });
    res.json(await req.workspace.files.save({ path: scratchPath, text, baseline, eol, bom }));
  });
}
