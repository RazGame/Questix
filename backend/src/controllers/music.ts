import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import { Game } from '../models/Game';
import { Song } from '../models/Song';
import { AuthenticatedRequest } from '../middleware/auth';
import { isGameModerator } from '../services/gamePermissions';
import { generateJoinCode } from '../services/musicStore';
import { lanIp, webBase } from '../services/net';
import { runTool, spotiflacVersion, spotiflacUpdate } from '../services/python';
import { notifyAdminSongUpdated } from '../sockets/ioRef';

export const MEDIA_DIR = path.join(__dirname, '..', '..', 'media');
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

// Загрузить игру угадайки и проверить права модерации. Возвращает игру или null
// (ответ об ошибке уже отправлен).
const loadModerableGame = async (req: AuthenticatedRequest, res: Response) => {
  const game = await Game.findById(req.params.id);
  if (!game || game.kind !== 'guess_song') {
    res.status(404).json({ error: 'Игра не найдена' });
    return null;
  }
  if (!isGameModerator(game, req.user)) {
    res.status(403).json({ error: 'У вас нет прав для управления этой игрой' });
    return null;
  }
  return game;
};

const isDuplicateTitleError = (error: any) =>
  error?.code === 11000 && (!error.keyPattern || error.keyPattern.title);

const normalizeMusicGameTitle = (title?: string) => {
  const trimmed = title?.trim();
  return trimmed || 'Новая музыкальная игра';
};

// ----- игры -----
export const listMusicGames = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const roles = req.user?.roles || [];
    const filter: any = { kind: 'guess_song' };
    // Организатор видит только свои игры, админ — все.
    if (!roles.includes('admin')) {
      filter.$or = [{ createdBy: req.user.id }, { organizers: req.user.id }];
    }
    const games = await Game.find(filter)
      .populate('createdBy', 'nickname')
      .populate('organizers', 'nickname')
      .sort('-createdAt')
      .lean();

    res.status(200).json(
      games.map((g) => {
        const songCount = g.blocks?.reduce((sum: number, b: any) => sum + (b.songIds?.length || 0), 0) || 0;
        return { ...g, songCount };
      })
    );
  } catch (error) {
    console.error('Ошибка загрузки музыкальных игр:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const createMusicGame = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const baseTitle = normalizeMusicGameTitle(req.body?.title);

  try {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = await generateJoinCode();
      const title = attempt === 0 ? baseTitle : `${baseTitle} ${attempt + 1}`;
      const game = new Game({
        kind: 'guess_song',
        format: 'offline',
        title,
        code,
        blocks: [{ name: 'Блок 1', songIds: [] }],
        createdBy: req.user.id,
      });

      try {
        await game.save();
        res.status(201).json({ game });
        return;
      } catch (error: any) {
        if (isDuplicateTitleError(error)) continue;
        throw error;
      }
    }

    const code = await generateJoinCode();
    const game = new Game({
      kind: 'guess_song',
      format: 'offline',
      title: `${baseTitle} ${Date.now()}`,
      code,
      blocks: [{ name: 'Блок 1', songIds: [] }],
      createdBy: req.user.id,
    });
    await game.save();
    res.status(201).json({ game });
  } catch (error: any) {
    if (isDuplicateTitleError(error)) {
      res.status(409).json({ error: 'Игра с таким названием уже существует' });
      return;
    }
    console.error('Ошибка создания музыкальной игры:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Полная игра вместе с песнями (для редактора).
export const getMusicGame = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const game = await Game.findById(req.params.id)
      .populate('createdBy', 'nickname')
      .populate('organizers', 'nickname')
      .lean();
    if (!game || game.kind !== 'guess_song') {
      res.status(404).json({ error: 'Игра не найдена' });
      return;
    }
    const songs = await Song.find({ gameId: game._id }).lean();
    res.status(200).json({ game, songs });
  } catch (error) {
    console.error('Ошибка загрузки музыкальной игры:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const updateMusicGame = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const game = await loadModerableGame(req, res);
    if (!game) return;
    if (typeof req.body?.title === 'string') game.title = req.body.title.trim();
    await game.save();
    res.status(200).json({ game });
  } catch (error) {
    console.error('Ошибка обновления музыкальной игры:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const deleteMusicGame = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const game = await loadModerableGame(req, res);
    if (!game) return;
    await Song.deleteMany({ gameId: game._id });
    await game.deleteOne();
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Ошибка удаления музыкальной игры:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// ----- блоки -----
export const addBlock = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const game = await loadModerableGame(req, res);
    if (!game) return;
    const name = (req.body?.name || `Блок ${(game.blocks?.length || 0) + 1}`).trim();
    game.blocks!.push({ name, songIds: [] } as any);
    await game.save();
    res.status(201).json({ game });
  } catch (error) {
    console.error('Ошибка добавления блока:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const updateBlock = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const game = await loadModerableGame(req, res);
    if (!game) return;
    const block = game.blocks?.find((b) => String(b._id) === req.params.blockId);
    if (!block) {
      res.status(404).json({ error: 'Блок не найден' });
      return;
    }
    if (typeof req.body?.name === 'string') block.name = req.body.name.trim();
    await game.save();
    res.status(200).json({ game });
  } catch (error) {
    console.error('Ошибка обновления блока:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const removeBlock = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  console.log(`[DEBUG] removeBlock called for gameId: ${req.params.id}, blockId: ${req.params.blockId}`);
  try {
    const game = await loadModerableGame(req, res);
    if (!game) {
      console.log(`[DEBUG] removeBlock: game not found or not moderable`);
      return;
    }
    console.log(`[DEBUG] removeBlock: game found. Blocks:`, game.blocks?.map(b => b._id?.toString() || 'no-id'));
    const block = game.blocks?.find((b) => String(b._id) === req.params.blockId);
    if (block) {
      console.log(`[DEBUG] removeBlock: block found, deleting songs and pulling block...`);
      await Song.deleteMany({ _id: { $in: block.songIds } });
      if (typeof (game.blocks as any).pull === 'function') {
        (game.blocks as any).pull(block._id);
        console.log(`[DEBUG] removeBlock: pulled using mongoose pull`);
      } else {
        game.blocks = game.blocks!.filter((b) => String(b._id) !== req.params.blockId);
        console.log(`[DEBUG] removeBlock: filtered using array filter`);
      }
      await game.save();
      console.log(`[DEBUG] removeBlock: game saved successfully`);
    } else {
      console.log(`[DEBUG] removeBlock: block not found in game blocks`);
    }
    res.status(200).json({ game });
  } catch (error) {
    console.error('Ошибка удаления блока:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// ----- песни -----
export const addSong = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const game = await loadModerableGame(req, res);
    if (!game) return;
    const { blockId, song } = req.body || {};
    const block =
      game.blocks?.find((b) => String(b._id) === blockId) || game.blocks?.[0];
    if (!block) {
      res.status(400).json({ error: 'Нет блока для песни' });
      return;
    }

    const created = await Song.create({
      gameId: game._id,
      title: song?.title || 'Без названия',
      artist: song?.artist || '',
      album: song?.album || '',
      cover: song?.cover || '',
      duration: song?.duration || 0,
      startSec: song?.startSec || 0,
      sourceUrl: song?.sourceUrl || '',
      preview: song?.preview || '',
      file: song?.file || null,
      status: song?.file ? 'ready' : 'pending',
    });

    block.songIds.push(created._id as any);
    await game.save();
    res.status(201).json({ song: created });

    // Есть ссылка-источник и нет файла — качаем в фоне через SpotiFLAC.
    if (created.sourceUrl && !created.file) {
      downloadSong(String(game._id), String(created._id)).catch(() => {});
    }
  } catch (error) {
    console.error('Ошибка добавления песни:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

const downloadSongsSequentially = async (gameId: string, songIds: string[]): Promise<void> => {
  for (const songId of songIds) {
    await downloadSong(gameId, songId).catch(() => {});
  }
};

export const importPlaylist = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const game = await loadModerableGame(req, res);
    if (!game) return;

    const { blockId, url } = req.body || {};
    const block =
      game.blocks?.find((b) => String(b._id) === blockId) || game.blocks?.[0];
    if (!block) {
      res.status(400).json({ error: 'Нет блока для песен' });
      return;
    }

    const playlistUrl = String(url || '').trim();
    if (!playlistUrl) {
      res.status(400).json({ error: 'Укажите ссылку на плейлист' });
      return;
    }

    const out = await runTool('spotiflac_playlist.py', [playlistUrl, '100']);
    if (!out.ok) {
      res.status(502).json({ error: out.error || 'Не удалось прочитать плейлист' });
      return;
    }

    const tracks = Array.isArray(out.results) ? out.results : [];
    if (tracks.length === 0) {
      res.status(400).json({ error: 'В плейлисте не найдено доступных треков' });
      return;
    }

    const sourceUrls = tracks.map((track: any) => track.sourceUrl).filter(Boolean);
    const existing = await Song.find({
      gameId: game._id,
      sourceUrl: { $in: sourceUrls },
    }).select('sourceUrl').lean();
    const existingUrls = new Set(existing.map((song: any) => song.sourceUrl));

    const createdIds: string[] = [];
    for (const track of tracks) {
      if (!track?.sourceUrl || existingUrls.has(track.sourceUrl)) continue;

      const created = await Song.create({
        gameId: game._id,
        title: track.title || 'Без названия',
        artist: track.artist || '',
        album: track.album || '',
        cover: track.cover || '',
        duration: track.duration || 0,
        startSec: 0,
        sourceUrl: track.sourceUrl,
        preview: track.preview || '',
        file: null,
        status: 'pending',
      });

      block.songIds.push(created._id as any);
      createdIds.push(String(created._id));
      existingUrls.add(track.sourceUrl);
    }

    await game.save();
    res.status(201).json({
      ok: true,
      playlist: out.playlist || null,
      imported: createdIds.length,
      skipped: tracks.length - createdIds.length,
    });

    if (createdIds.length > 0) {
      downloadSongsSequentially(String(game._id), createdIds).catch(() => {});
    }
  } catch (error) {
    console.error('Ошибка импорта плейлиста:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const updateSong = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const game = await loadModerableGame(req, res);
    if (!game) return;
    const patch: any = {};
    // Через REST правим только безопасные поля.
    if (req.body?.startSec !== undefined) patch.startSec = req.body.startSec;
    if (req.body?.endSec !== undefined) patch.endSec = req.body.endSec;
    if (req.body?.title !== undefined) patch.title = req.body.title;
    if (req.body?.artist !== undefined) patch.artist = req.body.artist;

    const song = await Song.findOneAndUpdate(
      { _id: req.params.songId, gameId: game._id },
      patch,
      { new: true }
    );
    if (!song) {
      res.status(404).json({ error: 'Песня не найдена' });
      return;
    }
    res.status(200).json({ song });
  } catch (error) {
    console.error('Ошибка обновления песни:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const removeSong = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const game = await loadModerableGame(req, res);
    if (!game) return;
    await Song.deleteOne({ _id: req.params.songId, gameId: game._id });
    game.blocks?.forEach((b) => {
      if (b.songIds && typeof (b.songIds as any).pull === 'function') {
        (b.songIds as any).pull(req.params.songId);
      } else {
        b.songIds = b.songIds.filter((s) => String(s) !== req.params.songId) as any;
      }
    });
    await game.save();
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Ошибка удаления песни:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Ручная загрузка аудиофайла (фолбэк).
export const uploadSongFile = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const game = await loadModerableGame(req, res);
    if (!game) return;
    const song = await Song.findOne({ _id: req.params.songId, gameId: game._id });
    if (!song) {
      res.status(404).json({ error: 'Песня не найдена' });
      return;
    }
    if (!req.body || !req.body.length) {
      res.status(400).json({ error: 'Пустой файл' });
      return;
    }
    const ext =
      String(req.query.ext || 'mp3').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'mp3';
    const dest = `${song._id}.${ext}`;
    fs.writeFileSync(path.join(MEDIA_DIR, dest), req.body);
    song.status = 'ready';
    song.file = dest;
    song.error = null;
    await song.save();
    res.status(200).json({ song });
  } catch (error) {
    console.error('Ошибка загрузки файла:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// ----- загрузка через SpotiFLAC -----
// Фоновая загрузка трека: статусы шлём в админку через сокет.
async function downloadSong(gameId: string, songId: string): Promise<void> {
  const song = await Song.findById(songId);
  if (!song || !song.sourceUrl) return;

  song.status = 'downloading';
  song.error = null;
  await song.save();
  notifyAdminSongUpdated(gameId, song);

  const tmpDir = path.join(MEDIA_DIR, `_dl_${songId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  // SpotiFLAC не отдаёт прогресс загрузки, поэтому показываем индетерминантную
  // полосу на фронте (статус 'downloading'), без выдуманного процента.
  const quality = process.env.MUSIC_QUALITY || 'HIGH';
  const result = await runTool('spotiflac_download.py', [song.sourceUrl, tmpDir, quality]);

  if (!result.ok || !result.file) {
    song.status = 'error';
    song.error = result.error || 'download failed';
    await song.save();
    notifyAdminSongUpdated(gameId, song);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return;
  }

  const ext = path.extname(result.file) || '.flac';
  const dest = `${songId}${ext}`;
  try {
    fs.renameSync(result.file, path.join(MEDIA_DIR, dest));
  } catch {
    fs.copyFileSync(result.file, path.join(MEDIA_DIR, dest));
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });

  song.status = 'ready';
  song.file = dest;
  song.error = null;
  await song.save();
  notifyAdminSongUpdated(gameId, song);
}

// Поиск песен (Deezer/Spotify metadata через SpotiFLAC).
export const searchSongs = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    res.json({ results: [] });
    return;
  }
  const out = await runTool('spotiflac_search.py', [q, '12']);
  if (!out.ok) {
    res.status(502).json({ error: out.error || 'search failed' });
    return;
  }
  res.json({ results: out.results || [] });
};

// Повторная/ручная авто-загрузка песни.
export const triggerDownload = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const game = await loadModerableGame(req, res);
  if (!game) return;
  downloadSong(String(game._id), req.params.songId).catch(() => {});
  res.json({ ok: true });
};

// ----- SpotiFLAC версия / обновление -----
export const getSpotiflacVersion = async (
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  res.json({ version: await spotiflacVersion() });
};

export const updateSpotiflac = async (
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const result = await spotiflacUpdate();
  if (!result.ok) {
    res.status(502).json({ error: result.error || 'update failed' });
    return;
  }
  res.json({ version: await spotiflacVersion() });
};

// ----- сеть / QR -----
export const getNet = async (
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  res.json({ ip: lanIp(), base: webBase() });
};

export const getQr = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const text = String(req.query.text || '');
  try {
    const dataUrl = await QRCode.toDataURL(text, { width: 480, margin: 1 });
    res.json({ dataUrl });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};
