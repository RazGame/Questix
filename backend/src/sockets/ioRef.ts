import { Server } from 'socket.io';

// Холдер инстанса Socket.IO, чтобы контроллеры (фоновая загрузка песен)
// могли слать события без циклического импорта index.ts.
let io: Server | null = null;

export const setIo = (instance: Server): void => {
  io = instance;
};

export const getIo = (): Server | null => io;

// Уведомить админку игры об изменении песни (статус загрузки).
export const notifyAdminSongUpdated = (gameId: string, song: unknown): void => {
  io?.to(`g:${gameId}:admin`).emit('song-updated', { song });
};
