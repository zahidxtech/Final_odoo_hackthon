import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ensurePythonDeps, pythonEnv, spawnPython } from './python-runner.mjs';

const rootDir = process.cwd();
const backendPort = process.env.BACKEND_PORT || '8001';

const pyEnv = pythonEnv(rootDir);

const viteBin = process.platform === 'win32'
  ? path.join(rootDir, 'node_modules', '.bin', 'vite.cmd')
  : path.join(rootDir, 'node_modules', '.bin', 'vite');
const viteCmd = fs.existsSync(viteBin) ? viteBin : 'npx';
const viteArgs = fs.existsSync(viteBin)
  ? ['--port', '3000', '--host', '0.0.0.0']
  : ['vite', '--port', '3000', '--host', '0.0.0.0'];

const vite = spawn(viteCmd, viteArgs, {
  cwd: rootDir,
  stdio: 'inherit',
  env: { ...process.env, BACKEND_PORT: backendPort },
  shell: process.platform === 'win32' && viteCmd.endsWith('.cmd'),
});

let uvicorn = null;
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    if (uvicorn) uvicorn.kill('SIGTERM');
  } catch {}
  try {
    vite.kill('SIGTERM');
  } catch {}
  setTimeout(() => process.exit(code), 200);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

vite.on('exit', (code) => {
  if (!shuttingDown) {
    console.error(`Vite exited with code ${code}`);
    shutdown(code ?? 1);
  }
});

if (ensurePythonDeps(rootDir)) {
  uvicorn = spawnPython(
    ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', backendPort],
    { cwd: rootDir, stdio: 'inherit', env: pyEnv }
  );

  uvicorn.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`FastAPI uvicorn exited with code ${code}`);
      shutdown(code ?? 1);
    }
  });
} else {
  console.error('[dev] Failed to install Python dependencies from requirements.txt');
  shutdown(1);
}
