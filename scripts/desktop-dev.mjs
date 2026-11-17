import { spawn } from 'node:child_process';
import electron from 'electron';
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, HIVE_DESKTOP_DEV: '1' }, windowsHide: true });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
