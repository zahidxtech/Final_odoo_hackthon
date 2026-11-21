import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const runnerDir = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(runnerDir, '..');

export function resolvePython() {
  const candidates = process.platform === 'win32'
    ? [
        { command: 'python', prefix: [] },
        { command: 'py', prefix: ['-3'] },
        { command: 'python3', prefix: [] },
      ]
    : [
        { command: 'python3', prefix: [] },
        { command: 'python', prefix: [] },
      ];

  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.prefix, '--version'], {
      stdio: 'ignore',
    });
    if (result.status === 0) return candidate;
  }
  return null;
}

export function pythonEnv(cwd = rootDir) {
  const pyLibsDir = path.join(cwd, '.pylibs');
  const existing = process.env.PYTHONPATH;
  return {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    PYTHONPATH: existing ? `${pyLibsDir}${path.delimiter}${existing}` : pyLibsDir,
  };
}

export function spawnPython(args, options = {}) {
  const python = resolvePython();
  if (!python) throw new Error('Python was not found. Install Python 3.11+ and add it to PATH.');
  return spawn(python.command, [...python.prefix, ...args], options);
}

export function ensurePythonDeps(cwd = rootDir) {
  const python = resolvePython();
  if (!python) {
    console.error('[python] Python 3 was not found. Install Python 3.11+ and add it to PATH.');
    return false;
  }

  const env = pythonEnv(cwd);
  const check = spawnSync(
    python.command,
    [...python.prefix, '-c', 'import fastapi, uvicorn, pydantic, jwt, bcrypt'],
    { cwd, env, stdio: 'ignore' }
  );
  if (check.status === 0) return true;

  const pyLibsDir = path.join(cwd, '.pylibs');
  fs.mkdirSync(pyLibsDir, { recursive: true });
  console.log('[python] Installing project dependencies into .pylibs...');
  const install = spawnSync(
    python.command,
    [...python.prefix, '-m', 'pip', 'install', '--no-cache-dir', '--upgrade', '--force-reinstall', '--target', pyLibsDir, '-r', 'requirements.txt'],
    { cwd, env, stdio: 'inherit' }
  );
  if (install.status !== 0) return false;

  const verify = spawnSync(
    python.command,
    [...python.prefix, '-c', 'import fastapi, uvicorn, pydantic, jwt, bcrypt'],
    { cwd, env, stdio: 'ignore' }
  );
  return verify.status === 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let args = process.argv.slice(2);
  if (args[0] === '--production') {
    process.env.NODE_ENV = 'production';
    args = args.slice(1);
  }

  if (!ensurePythonDeps(rootDir)) process.exit(1);

  const child = spawnPython(args, {
    cwd: rootDir,
    env: pythonEnv(rootDir),
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code ?? 1));
}
