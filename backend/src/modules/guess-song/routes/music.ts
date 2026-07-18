import { Router } from 'express';
import express from 'express';
import { authMiddleware, organizerMiddleware } from '../../../core/middleware/auth';
import * as music from '../controllers/music';

const router = Router();

// Публичная мета по коду (без авторизации) — странице игрока, до общего гварда.
router.get('/public/:code', music.getPublicMeta);
router.get('/cover', music.proxyCover);

// Все остальные маршруты управления музыкой — для администратора или организатора.
// (Игроки/экран ходят не сюда, а в Socket.IO и в /media.)
router.use(authMiddleware, organizerMiddleware);

// сеть / QR
router.get('/net', music.getNet);
router.get('/qr', music.getQr);

// поиск песен (SpotiFLAC)
router.get('/search', music.searchSongs);

// SpotiFLAC версия
router.get('/spotiflac/version', music.getSpotiflacVersion);

// игры
router.get('/games', music.listMusicGames);
router.post('/games', music.createMusicGame);
// bundle: импорт до /games/:id, чтобы «import» не матчился как :id
router.post(
  '/games/import',
  express.raw({ type: '*/*', limit: '2gb' }),
  music.importGameBundle
);
router.get('/games/:id/export', music.exportGameBundle);
router.get('/games/:id', music.getMusicGame);
router.patch('/games/:id', music.updateMusicGame);
router.delete('/games/:id', music.deleteMusicGame);

// блоки
router.post('/games/:id/blocks', music.addBlock);
router.patch('/games/:id/blocks/:blockId', music.updateBlock);
router.delete('/games/:id/blocks/:blockId', music.removeBlock);

// песни
router.post('/games/:id/songs', music.addSong);
router.post('/games/:id/playlist-import', music.importPlaylist);
router.patch('/games/:id/songs/:songId', music.updateSong);
router.delete('/games/:id/songs/:songId', music.removeSong);

// повторная авто-загрузка через SpotiFLAC
router.post('/games/:id/songs/:songId/download', music.triggerDownload);

// ручная загрузка аудиофайла (raw body)
router.post(
  '/games/:id/songs/:songId/upload',
  express.raw({ type: '*/*', limit: '400mb' }),
  music.uploadSongFile
);

export default router;
