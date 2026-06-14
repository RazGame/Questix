import path from 'path';
import { spawn } from 'child_process';

const PY = process.env.PYTHON || 'python3';
// tools лежат в backend/tools (рядом с dist при сборке — поднимаемся из dist/services)
const TOOLS = path.join(__dirname, '..', '..', 'tools');

export interface ToolResult {
  ok: boolean;
  error?: string;
  results?: any[];
  file?: string;
  [key: string]: unknown;
}

// Запускает python-скрипт из tools/ и парсит последнюю строку stdout как JSON.
export const runTool = (scriptName: string, args: string[]): Promise<ToolResult> => {
  const script = path.join(TOOLS, scriptName);
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    const child = spawn(PY, [script, ...args], { windowsHide: true });
    child.stdout.on('data', (d) => { out += d.toString('utf8'); });
    child.stderr.on('data', (d) => { err += d.toString('utf8'); });
    child.on('error', (e) => resolve({ ok: false, error: `python: ${e.message}` }));
    child.on('close', () => {
      const line = out.trim().split('\n').filter(Boolean).pop() || '';
      try {
        resolve(JSON.parse(line));
      } catch {
        resolve({ ok: false, error: err.trim() || out.trim() || 'нет вывода от python' });
      }
    });
  });
};

// Текущая установленная версия SpotiFLAC (или null).
export const spotiflacVersion = (): Promise<string | null> =>
  new Promise((resolve) => {
    const child = spawn(PY, ['-c', 'import importlib.metadata as m; print(m.version("SpotiFLAC"))'], {
      windowsHide: true,
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString('utf8'); });
    child.on('error', () => resolve(null));
    child.on('close', () => resolve(out.trim() || null));
  });

// Обновить SpotiFLAC до последней версии (pip install -U).
export const spotiflacUpdate = (): Promise<{ ok: boolean; error?: string }> =>
  new Promise((resolve) => {
    const child = spawn(PY, ['-m', 'pip', 'install', '-U', 'SpotiFLAC'], { windowsHide: true });
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString('utf8'); });
    child.on('error', (e) => resolve({ ok: false, error: e.message }));
    child.on('close', (code) =>
      resolve(code === 0 ? { ok: true } : { ok: false, error: err.trim() || `pip exited ${code}` })
    );
  });
