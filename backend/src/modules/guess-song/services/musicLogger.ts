import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type MusicLogLevel = 'debug' | 'info' | 'warn' | 'error';
export type MusicLogFields = Record<string, unknown>;

const LOG_DIR = path.resolve(process.env.MUSIC_LOG_DIR || path.join(process.cwd(), 'logs'));
const RETENTION_DAYS = Math.max(1, Math.min(365, Number(process.env.MUSIC_LOG_RETENTION_DAYS) || 30));
const BOOT_ID = crypto.randomBytes(4).toString('hex');
const FILE_RE = /^guess-song-(\d{4}-\d{2}-\d{2})\.jsonl$/;
const REDACT_RE = /token|authorization|password|secret|jwt/i;

let initPromise: Promise<void> | null = null;
let writeQueue = Promise.resolve();

const prepareLogDir = async () => {
  await fs.promises.mkdir(LOG_DIR, { recursive: true });
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const entries = await fs.promises.readdir(LOG_DIR, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const match = entry.isFile() ? FILE_RE.exec(entry.name) : null;
    if (!match) return;
    const day = Date.parse(`${match[1]}T00:00:00.000Z`);
    if (Number.isFinite(day) && day < cutoff) {
      await fs.promises.unlink(path.join(LOG_DIR, entry.name)).catch(() => undefined);
    }
  }));
};

const ensureLogDir = () => {
  if (!initPromise) initPromise = prepareLogDir();
  return initPromise;
};

const safeValue = (value: unknown, depth = 0): unknown => {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.slice(0, 1000);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message.slice(0, 1000),
      stack: value.stack?.split('\n').slice(0, 8).join('\n'),
    };
  }
  if (depth >= 4) return '[max-depth]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => safeValue(item, depth + 1));
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      result[key] = REDACT_RE.test(key) ? '[redacted]' : safeValue(item, depth + 1);
    }
    return result;
  }
  return String(value).slice(0, 1000);
};

/**
 * Структурированный журнал «Угадай мелодию».
 *
 * Каждая запись одновременно уходит в stdout Docker и в дневной JSONL-файл.
 * Запись не блокирует realtime-путь баззера и никогда не роняет игру.
 */
export const musicLog = (level: MusicLogLevel, event: string, fields: MusicLogFields = {}) => {
  const ts = new Date().toISOString();
  const record = {
    ...safeValue(fields) as Record<string, unknown>,
    ts,
    level,
    scope: 'guess_song',
    bootId: BOOT_ID,
    event: String(event).slice(0, 100),
  };
  const line = JSON.stringify(record);

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);

  writeQueue = writeQueue
    .then(async () => {
      await ensureLogDir();
      const file = path.join(LOG_DIR, `guess-song-${ts.slice(0, 10)}.jsonl`);
      await fs.promises.appendFile(file, `${line}\n`, 'utf8');
    })
    .catch((error) => {
      // Сбой журнала не должен сломать игровой процесс. После ошибки очередь
      // остаётся рабочей: следующий вызов снова попробует записать файл.
      console.error('[guess_song_logger] Не удалось записать лог:', error);
    });
};

export const musicLogLocation = () => LOG_DIR;
