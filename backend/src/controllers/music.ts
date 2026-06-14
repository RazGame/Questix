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
import { notifyAdminSongUpdated, notifySongProgress } from '../sockets/ioRef';

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

    // Считаем песни по играм одним запросом.
    const counts = await Song.aggregate([
      { $match: { gameId: { $in: games.map((g) => g._id) } } },
      { $group: { _id: '$gameId', count: { $sum: 1 } } },
    ]);
    const countBy = new Map(counts.map((c) => [String(c._id), c.count]));

    res.status(200).json(
      games.map((g) => ({ ...g, songCount: countBy.get(String(g._id)) || 0 }))
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
  try {
    const code = await generateJoinCode();
    const game = new Game({
      kind: 'guess_song',
      format: 'offline',
      title: (req.body?.title || 'Новая музыкальная игра').trim(),
      code,
      blocks: [{ name: 'Блок 1', songIds: [] }],
      createdBy: req.user.id,
    });
    await game.save();
    res.status(201).json({ game });
  } catch (error) {
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
  try {
    const game = await loadModerableGame(req, res);
    if (!game) return;
    const block = game.blocks?.find((b) => String(b._id) === req.params.blockId);
    if (block) {
      await Song.deleteMany({ _id: { $in: block.songIds } });
      game.blocks = game.blocks!.filter((b) => String(b._id) !== req.params.blockId);
      await game.save();
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
      b.songIds = b.songIds.filter((s) => String(s) !== req.params.songId) as any;
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

  // Прогресс: SpotiFLAC не отдаёт колбэков, поэтому оцениваем по росту файла.
  // Оценка полного размера: HIGH ~ 320 кбит/с → 40 КБ/с. Без длительности — фолбэк 8 МБ.
  const quality = process.env.MUSIC_QUALITY || 'HIGH';
  const estBytes = song.duration > 0 ? song.duration * 40000 : 8_000_000;
  const progressTimer = setInterval(() => {
    try {
      let total = 0;
      for (const f of fs.readdirSync(tmpDir, { withFileTypes: true })) {
        if (f.isFile()) total += fs.statSync(path.join(tmpDir, f.name)).size;
      }
      const pct = Math.min(99, Math.round((total / estBytes) * 100));
      if (pct > 0) notifySongProgress(gameId, songId, pct);
    } catch { /* ignore */ }
  }, 500);

  const result = await runTool('spotiflac_download.py', [song.sourceUrl, tmpDir, quality]);
  clearInterval(progressTimer);

  if (!result.ok || !result.file) {
    song.status = 'error';
    song.error = result.error || 'download failed';
    await song.save();
    notifyAdminSongUpdated(gameId, song);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return;
  }

  notifySongProgress(gameId, songId, 100);

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
