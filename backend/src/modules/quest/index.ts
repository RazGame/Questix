import { Router } from 'express';
import type { GameModuleBackend } from '../../core/moduleRegistry';
import gameRoutes from './routes/game';
import applRoutes from './routes/gameAppl';
import taskRoutes from './routes/task';
import progressRoutes from './routes/gameProgress';

// Квесты: исторические top-level пути (/games, /appls, /tasks, /progress)
// сохраняем как есть — модуль монтируется в корень со своим под-роутингом.
const router = Router();
router.use('/games', gameRoutes);
router.use('/appls', applRoutes);
router.use('/tasks', taskRoutes);
router.use('/progress', progressRoutes);

export const questModule: GameModuleBackend = {
  kind: 'quest',
  mountPath: '/',
  router,
  offline: false, // квестам нужен онлайн (аккаунты, каталог)
};
