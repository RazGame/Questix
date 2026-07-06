import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import { Game } from '../models/Game';
import { Song } from '../models/Song';
import { AuthenticatedRequest } from '../middleware/auth';
import { isGameModerator } from '../services/gamePermissions';
import { generateJoinCode } from '../services/musicStore';
import { dropSession } from '../services/musicSession';
import { lanIp, webBase } from '../services/net';
import { runTool, spotiflacVersion } from '../services/python';
import { notifyAdminSongUpdated, notifyAdminSongProgress } from '../sockets/ioRef';

export const MEDIA_DIR = path.join(__dirname, '..', '..', 'media');
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

const COVER_HOSTS = ['scdn.co', 'spotifycdn.com', 'dzcdn.net', 'mzstatic.com'];

const isAllowedCoverHost = (hostname: string): boolean =>
  COVER_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));

export const proxyCover = async (req: Request, res: Response): Promise<void> => {
  const rawUrl = String(req.query.url || '').trim();
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: 'Некорректная ссылка на обложку' });
    return;
  }

  if (!['http:', 'https:'].includes(url.protocol) || !isAllowedCoverHost(url.hostname)) {
    res.status(400).json({ error: 'Недопустимый источник обложки' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const upstream = await fetch(url, { signal: controller.signal });
    if (!upstream.ok || !upstream.body) {
      res.sendStatus(upstream.status || 502);
      return;
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    if (!contentType.toLowerCase().startsWith('image/')) {
      res.status(415).json({ error: 'Ответ не является изображением' });
      return;
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch {
    res.sendStatus(502);
  } finally {
    clearTimeout(timeout);
  }
};

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
  // Угадайка: одиночная или командная. Командная всегда требует авторизации
  // (счёт и баззер привязаны к командам Questix, а команда — к аккаунтам).
  const participation = req.body?.participation === 'team' ? 'team' : 'solo';
  const auth =
    participation === 'team' ? 'required' : req.body?.auth === 'required' ? 'required' : 'open';

  try {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = await generateJoinCode();
      const title = attempt === 0 ? baseTitle : `${baseTitle} ${attempt + 1}`;
      const game = new Game({
        kind: 'guess_song',
        format: 'offline',
        participation,
        auth,
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
      participation,
      auth,
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
    // Можно менять состав (solo/team) и вход. Командная всегда auth=required.
    if (req.body?.participation === 'solo' || req.body?.participation === 'team') {
      game.participation = req.body.participation;
    }
    if (req.body?.auth === 'open' || req.body?.auth === 'required') {
      game.auth = req.body.auth;
    }
    if (game.participation === 'team') game.auth = 'required';
    // Переупорядочивание блоков: blockOrder — перестановка id всех блоков.
    if (Array.isArray(req.body?.blockOrder)) {
      const order = req.body.blockOrder.map(String);
      const blocks = game.blocks || [];
      const byId = new Map(blocks.map((b) => [String(b._id), b]));
      const sameSet =
        order.length === blocks.length && order.every((id: string) => byId.has(id));
      if (!sameSet) {
        res.status(400).json({ error: 'blockOrder должен содержать все блоки игры' });
        return;
      }
      game.blocks = order.map((id: string) => byId.get(id)!) as any;
      game.markModified('blocks');
    }
    await game.save();
    res.status(200).json({ game });
  } catch (error) {
    console.error('Ошибка обновления музыкальной игры:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Публичная мета по коду (без авторизации) — нужна странице игрока,
// чтобы понять: показать вход по аккаунту или ввод имени.
export const getPublicMeta = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const game = await Game.findOne({
      code: (req.params.code || '').toUpperCase(),
      kind: 'guess_song',
    }).lean();
    if (!game) {
      res.status(404).json({ error: 'Игра не найдена' });
      return;
    }
    res.status(200).json({
      title: game.title,
      auth: game.auth || 'open',
      participation: game.participation || 'solo',
    });
  } catch (error) {
    console.error('Ошибка получения меты игры:', error);
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
    dropSession(String(game._id)); // снять realtime-сессию из памяти
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
    // Переупорядочивание песен: songIds — перестановка текущего состава блока.
    if (Array.isArray(req.body?.songIds)) {
      const order = req.body.songIds.map(String);
      const existing = (block.songIds || []).map(String);
      const sameSet =
        order.length === existing.length &&
        new Set(order).size === order.length &&
        order.every((id: string) => existing.includes(id));
      if (!sameSet) {
        res.status(400).json({ error: 'songIds должен содержать все песни блока' });
        return;
      }
      block.songIds = order as any;
      game.markModified('blocks');
    }
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

  // SpotiFLAC не отдаёт процент — следим за ростом файлов во временной папке
  // и шлём в админку скачанные байты + оценку процента по длительности трека
  // (~33 КБ/с у m4a высокого качества; оценка, не точность).
  const expectedBytes = (song.duration || 0) * 33000;
  const dirSize = (dir: string): number => {
    let total = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) total += dirSize(full);
      else if (entry.isFile()) total += fs.statSync(full).size;
    }
    return total;
  };
  const progressTimer = setInterval(() => {
    try {
      const bytes = dirSize(tmpDir);
      const percent =
        expectedBytes > 0 ? Math.min(97, Math.round((bytes / expectedBytes) * 100)) : null;
      notifyAdminSongProgress(gameId, { songId, bytes, percent });
    } catch { /* папку могли уже удалить — прогресс больше не нужен */ }
  }, 700);

  const quality = process.env.MUSIC_QUALITY || 'HIGH';
  let result;
  try {
    result = await runTool('spotiflac_download.py', [
      song.sourceUrl,
      tmpDir,
      quality,
      song.title || '',
      song.artist || '',
    ]);
  } finally {
    clearInterval(progressTimer);
  }

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

// ----- SpotiFLAC версия -----
export const getSpotiflacVersion = async (
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
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
