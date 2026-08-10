import { Server } from 'socket.io';
import type { GameModuleBackend } from '../../core/moduleRegistry';
import musicRoutes from './routes/music';
import { registerMusicSockets } from './sockets/music';
import { setIo } from './sockets/ioRef';

export const guessSongModule: GameModuleBackend = {
  kind: 'guess_song',
  mountPath: '/music',
  router: musicRoutes,
  registerSockets: (io: Server) => {
    setIo(io); // io-холдер модуля: фоновая загрузка песен шлёт song-updated
    registerMusicSockets(io);
  },
  offline: true, // главный сценарий — локальная станция без интернета
};
