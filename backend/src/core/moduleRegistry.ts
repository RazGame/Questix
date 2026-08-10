import { Router } from 'express';
import { Server } from 'socket.io';
import { questModule } from '../modules/quest';
import { guessSongModule } from '../modules/guess-song';

// Реестр игровых модулей (ROADMAP этап 2). Новая игра = новая папка в
// modules/ + строчка здесь. Ядро монтирует роутеры и сокеты циклом,
// ничего не зная о содержимом модулей.
export interface GameModuleBackend {
  kind: string; // 'quest' | 'guess_song'
  mountPath: string; // куда монтируется router ('/' — свои top-level пути)
  router: Router;
  registerSockets?: (io: Server) => void;
  offline: boolean; // умеет ли работать на локальной станции (этап 6)
}

export const modules: GameModuleBackend[] = [questModule, guessSongModule];
