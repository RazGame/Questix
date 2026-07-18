import { Router, Request, Response } from 'express';
import { Game } from '../models/Game';

// Единый вход по коду (ROADMAP этап 2): публичный, без авторизации.
// Фронт по kind решает, на страницу какого модуля отправить игрока.
// /music/public/:code остаётся рабочим алиасом для угадайки.
const router = Router();

router.get('/:code', async (req: Request, res: Response): Promise<void> => {
  try {
    const game = await Game.findOne({
      code: (req.params.code || '').toUpperCase(),
    }).lean();
    if (!game) {
      res.status(404).json({ error: 'Игра не найдена' });
      return;
    }
    res.status(200).json({
      kind: game.kind || 'quest',
      title: game.title,
      auth: game.auth || 'open',
      participation: game.participation || 'solo',
    });
  } catch (error) {
    console.error('Ошибка входа по коду:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
