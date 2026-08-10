import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { Game } from '../../../core/models/Game';
import { Song } from '../models/Song';
import { generateJoinCode } from './musicStore';

// Экспорт/импорт игры «Угадай мелодию» одним zip-файлом (bundle).
// Назначение: бэкап, перенос между машинами, в будущем — транспорт
// «облако → станция» (ROADMAP этап 1).

export const BUNDLE_VERSION = 1;
export const MAX_BUNDLE_BYTES = 2 * 1024 * 1024 * 1024; // 2 ГБ

// Разрешённые расширения аудио внутри bundle (совпадают с ручным аплоадом).
const AUDIO_EXTS = new Set(['mp3', 'flac', 'm4a', 'ogg', 'wav', 'opus', 'aac', 'webm']);

interface BundleSong {
  title: string;
  artist: string;
  album: string;
  cover: string;
  duration: number;
  startSec: number;
  endSec: number | null;
  sourceUrl: string;
  note?: string; // подсказка ведущему
  fileName: string; // имя в media/ внутри zip
}

interface BundleBlock {
  name: string;
  songs: BundleSong[];
}

interface BundleManifest {
  version: number;
  exportedAt: string;
  game: {
    title: string;
    participation: string;
    auth: string;
    blocks: BundleBlock[];
  };
}

export class BundleError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Собрать zip игры: manifest.json + media/<fileName>.
// Кладём только готовые песни (status=ready с файлом) — остальным в bundle делать нечего.
export const exportGame = async (gameId: string, mediaDir: string): Promise<Buffer> => {
  const game = await Game.findById(gameId).lean();
  if (!game || game.kind !== 'guess_song') {
    throw new BundleError('Игра не найдена', 404);
  }

  const songs = await Song.find({ gameId }).lean();
  const songById = new Map(songs.map((s) => [String(s._id), s]));

  const zip = new AdmZip();
  const blocks: BundleBlock[] = [];

  for (const block of game.blocks || []) {
    const bundleSongs: BundleSong[] = [];
    for (const sid of block.songIds || []) {
      const song = songById.get(String(sid));
      if (!song || song.status !== 'ready' || !song.file) continue;

      const filePath = path.join(mediaDir, song.file);
      if (!fs.existsSync(filePath)) continue; // файл потерян — пропускаем песню

      zip.addLocalFile(filePath, 'media', song.file);
      bundleSongs.push({
        title: song.title || '',
        artist: song.artist || '',
        album: song.album || '',
        cover: song.cover || '',
        duration: song.duration || 0,
        startSec: song.startSec || 0,
        endSec: song.endSec ?? null,
        sourceUrl: song.sourceUrl || '',
        note: song.note || '',
        fileName: song.file,
      });
    }
    blocks.push({ name: block.name, songs: bundleSongs });
  }

  const manifest: BundleManifest = {
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    game: {
      title: game.title,
      participation: game.participation || 'solo',
      auth: game.auth || 'open',
      blocks,
    },
  };
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));

  return zip.toBuffer();
};

// Импорт bundle: создаёт НОВУЮ игру (новые _id и code), аудио пишется в
// mediaDir под именами <новыйSongId>.<ext>. Оригинал не затрагивается.
export const importGame = async (
  zipBuffer: Buffer,
  userId: string,
  mediaDir: string
) => {
  if (!zipBuffer || !zipBuffer.length) {
    throw new BundleError('Пустой файл');
  }
  if (zipBuffer.length > MAX_BUNDLE_BYTES) {
    throw new BundleError('Bundle больше 2 ГБ');
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    throw new BundleError('Файл не является zip-архивом');
  }

  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) {
    throw new BundleError('В архиве нет manifest.json');
  }

  let manifest: BundleManifest;
  try {
    manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  } catch {
    throw new BundleError('manifest.json повреждён');
  }
  if (manifest.version !== BUNDLE_VERSION) {
    throw new BundleError(`Неподдерживаемая версия bundle: ${manifest.version}`);
  }
  if (!manifest.game || !Array.isArray(manifest.game.blocks)) {
    throw new BundleError('manifest.json: нет описания игры');
  }

  // Проверяем расширения ДО создания чего-либо в БД.
  for (const block of manifest.game.blocks) {
    for (const song of block.songs || []) {
      const ext = path.extname(song.fileName || '').slice(1).toLowerCase();
      if (!AUDIO_EXTS.has(ext)) {
        throw new BundleError(`Недопустимый файл в bundle: ${song.fileName}`);
      }
      // Защита от zip-slip: имя не должно содержать путей.
      if (song.fileName !== path.basename(song.fileName)) {
        throw new BundleError(`Недопустимое имя файла: ${song.fileName}`);
      }
    }
  }

  // Название: как в createMusicGame — при коллизии добавляем суффикс.
  const baseTitle = (manifest.game.title || 'Импортированная игра').trim();
  const participation = manifest.game.participation === 'team' ? 'team' : 'solo';
  const auth =
    participation === 'team'
      ? 'required'
      : manifest.game.auth === 'required'
        ? 'required'
        : 'open';

  const code = await generateJoinCode();
  let game = null;
  for (let attempt = 0; attempt < 20 && !game; attempt += 1) {
    const title = attempt === 0 ? baseTitle : `${baseTitle} ${attempt + 1}`;
    const candidate = new Game({
      kind: 'guess_song',
      format: 'offline',
      participation,
      auth,
      title,
      code,
      blocks: [],
      createdBy: userId,
    });
    try {
      await candidate.save();
      game = candidate;
    } catch (error: any) {
      // duplicate key по title — пробуем следующий суффикс
      if (error?.code !== 11000) throw error;
    }
  }
  if (!game) {
    throw new BundleError('Не удалось создать игру: конфликт названий');
  }

  const writtenFiles: string[] = [];
  try {
    for (const block of manifest.game.blocks) {
      const songIds: any[] = [];
      for (const bundleSong of block.songs || []) {
        const entry = zip.getEntry(`media/${bundleSong.fileName}`);
        if (!entry) continue; // манифест обещал файл, но его нет — песню пропускаем

        const ext = path.extname(bundleSong.fileName).slice(1).toLowerCase();
        const song = new Song({
          gameId: game._id,
          title: bundleSong.title,
          artist: bundleSong.artist,
          album: bundleSong.album,
          cover: bundleSong.cover,
          duration: bundleSong.duration,
          startSec: bundleSong.startSec || 0,
          endSec: bundleSong.endSec ?? null,
          sourceUrl: bundleSong.sourceUrl || '',
          note: bundleSong.note || '',
          status: 'ready',
        });
        const fileName = `${song._id}.${ext}`;
        fs.writeFileSync(path.join(mediaDir, fileName), entry.getData());
        writtenFiles.push(fileName);
        song.file = fileName;
        await song.save();
        songIds.push(song._id);
      }
      game.blocks!.push({ name: block.name || 'Блок', songIds } as any);
    }
    await game.save();
  } catch (error) {
    // Импорт не удался — подчищаем то, что успели создать.
    await Song.deleteMany({ gameId: game._id }).catch(() => {});
    await game.deleteOne().catch(() => {});
    for (const f of writtenFiles) {
      try { fs.unlinkSync(path.join(mediaDir, f)); } catch { /* ignore */ }
    }
    throw error;
  }

  return game;
};
