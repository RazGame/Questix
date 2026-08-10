import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { Game } from '../models/Game';
import { isGameModerator } from '../services/gamePermissions';

export interface AuthenticatedRequest extends Request {
  user?: any;
}

export const authMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Токен не найден' });
    return;
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Неверный токен' });
  }
};

export const adminMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user?.roles?.includes('admin')) {
    res.status(403).json({ error: 'Доступ запрещен' });
    return;
  }
  next();
};

export const organizerMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const roles = req.user?.roles || [];
  if (!roles.includes('admin') && !roles.includes('organizer')) {
    res.status(403).json({ error: 'Доступ запрещен. Требуется роль организатора или администратора' });
    return;
  }
  next();
};

export const teamCaptainMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const roles = req.user?.roles || [];
  if (!roles.includes('team_captain')) {
    res.status(403).json({ error: 'Доступ запрещен. Требуется роль капитана команды' });
    return;
  }
  next();
};

// Проверка, может ли пользователь модерировать эту игру:
// админ - любую, организатор - созданную им или где он соорганизатор
export const canModerateGame = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const gameId = req.params.gameId || req.params.id;
    const game = await Game.findById(gameId);

    if (!game) {
      res.status(404).json({ error: 'Игра не найдена' });
      return;
    }

    if (isGameModerator(game, req.user)) {
      next();
      return;
    }

    res.status(403).json({ error: 'У вас нет прав для модерирования этой игры' });
  } catch (error) {
    console.error('Ошибка проверки прав:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};
