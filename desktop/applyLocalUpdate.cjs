const fs = require('original-fs').promises;
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');

const [, , parentArgument, token, ...args] = process.argv;
const parent = Number(parentArgument);
const directory = __dirname;
const resources = path.dirname(directory);
const archive = path.join(resources, 'app.asar');
const backup = path.join(resources, 'app.previous.asar');
const ready = path.join(directory, 'ready');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.HIVE_UPDATE_STARTUP;
delete env.HIVE_UPDATE_RESTORED;

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

async function start(extraEnv) {
  const child = spawn(process.execPath, args, {
    cwd: path.dirname(process.execPath), detached: true, stdio: 'ignore', env: { ...env, ...extraEnv },
  });
  await once(child, 'spawn');
  return child;
}

async function apply() {
  if (!Number.isSafeInteger(parent) || parent <= 0 || !/^[0-9a-f-]{36}$/.test(token) ||
      path.basename(directory) !== '.hive-update-' + token ||
      resources !== path.join(path.dirname(process.execPath), 'resources')) return;

  let replaced = false;
  let child;
  let phase = 'waiting';
  try {
    const parentDeadline = Date.now() + 35000;
    while (alive(parent) && Date.now() < parentDeadline) await delay(100);
    if (alive(parent)) return;

    phase = 'backup';
    const nextBackup = path.join(directory, 'previous.asar');
    await fs.copyFile(archive, nextBackup);
    await fs.rename(nextBackup, backup);
    phase = 'replace';
    const staged = path.join(directory, 'app.asar');
    for (let attempts = 0; ; attempts++) {
      try { await fs.rename(staged, archive); break; }
      catch (error) {
        if (attempts >= 12 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
        await delay(200);
      }
    }
    replaced = true;

    phase = 'restart';
    child = await start({ HIVE_UPDATE_STARTUP: token });
    const launchDeadline = Date.now() + 45000;
    while (Date.now() < launchDeadline) {
      if (await fs.access(ready).then(() => true, () => false)) {
        child.unref();
        return;
      }
      if (child.exitCode !== null || child.signalCode !== null) break;
      await delay(150);
    }
    throw new Error('The updated app did not start');
  } catch (error) {
    await fs.writeFile(path.join(resources, 'hive-update-last-error.json'),
      JSON.stringify({phase, code:error.code || null, exitCode:child?.exitCode ?? null})).catch(() => {});
    if (child && child.exitCode === null && child.signalCode === null) {
      const exit = once(child, 'exit');
      child.kill();
      await exit;
    }
    if (replaced) await fs.rename(backup, archive);
    const restored = await start({ HIVE_UPDATE_RESTORED: '1' });
    restored.unref();
  } finally {
    for (const name of ['app.asar', 'previous.asar', 'ready', 'apply.cjs']) {
      await fs.rm(path.join(directory, name), { force: true }).catch(() => {});
    }
    await fs.rmdir(directory).catch(() => {});
  }
}

apply().catch(() => { process.exitCode = 1; });
