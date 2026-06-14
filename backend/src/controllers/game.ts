import { Response } from 'express';
import { Error as MongooseError } from 'mongoose';
import Joi from 'joi';
import { Game } from '../models/Game';
import { GameAppl } from '../models/GameAppl';
import { GameTeamProgress } from '../models/GameTeamProgress';
import { Task } from '../models/Task';
import { TeamLog } from '../models/TeamLog';
import { User } from '../models/User';
import { AuthenticatedRequest } from '../middleware/auth';
import { hasInvalidDateRange } from '../services/questState';
import { isGameModerator, canManageOrganizers } from '../services/gamePermissions';

const gameSchema = Joi.object({
  title: Joi.string().required().trim(),
  city: Joi.string().required().trim(),
  dateofstart: Joi.date().required(),
  dateofend: Joi.date().required(),
  deposit: Joi.string().required().trim(),
  prize: Joi.string().required().trim(),
  description: Joi.string().required().trim(),
  taskOrderMode: Joi.string().valid('linear', 'random', 'manual').default('linear'),
  organizerNicknames: Joi.array().items(Joi.string().trim()).default([]),
});

// Для частичного обновления: presence: 'optional' в validate не снимает
// явные .required(), поэтому нужна отдельная схема
const gameUpdateSchema = Joi.object({
  title: Joi.string().trim(),
  city: Joi.string().trim(),
  dateofstart: Joi.date(),
  dateofend: Joi.date(),
  deposit: Joi.string().trim(),
  prize: Joi.string().trim(),
  description: Joi.string().trim(),
  taskOrderMode: Joi.string().valid('linear', 'random', 'manual'),
}).min(1);

export const getAllGames = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    // Каталог показывает только квесты; игры «Угадай мелодию» сюда не попадают.
    const games = await Game.find({ kind: { $ne: 'guess_song' } })
      .populate('createdBy', 'nickname firstName lastName')
      .populate('organizers', 'nickname firstName lastName')
      .populate({
        path: 'gameAppls',
        select: 'status userId',
      });

    res.status(200).json(games);
  } catch (error) {
    console.error('Ошибка загрузки квестов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const getGameById = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const game = await Game.findById(req.params.id)
      .populate('createdBy', 'nickname firstName lastName')
      .populate('organizers', 'nickname firstName lastName')
      .populate({
        path: 'gameAppls',
        populate: [
          { path: 'userId', select: 'nickname firstName lastName' },
          {
            path: 'team',
            select: 'name captain members',
            populate: { path: 'captain', select: 'nickname firstName lastName' },
          },
        ],
      });

    if (!game) {
      res.status(404).json({ error: 'Квест не найден' });
      return;
    }

    res.status(200).json(game);
  } catch (error) {
    console.error('Ошибка загрузки квеста:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const createGame = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    // Только организаторы и администраторы могут создавать игры
    const roles = req.user?.roles || [];
    if (!roles.includes('admin') && !roles.includes('organizer')) {
      res.status(403).json({ error: 'У вас нет прав для создания квеста' });
      return;
    }

    const { error, value } = gameSchema.validate(req.body);

    if (error) {
      res.status(400).json({ errors: error.details.map((d) => d.message) });
      return;
    }

    if (hasInvalidDateRange(value.dateofstart, value.dateofend)) {
      res.status(400).json({ errors: ['Дата окончания должна быть позже даты начала'] });
      return;
    }

    const organizerNicknames = Array.from(
      new Set((value.organizerNicknames as string[]).map((nickname) => nickname.trim()).filter(Boolean))
    );
    const organizers = organizerNicknames.length
      ? await User.find({ nickname: { $in: organizerNicknames } })
      : [];

    if (organizers.length !== organizerNicknames.length) {
      const foundNicknames = new Set(organizers.map((organizer) => organizer.nickname));
      const missing = organizerNicknames.filter((nickname) => !foundNicknames.has(nickname));
      res.status(404).json({ error: `Пользователи не найдены: ${missing.join(', ')}` });
      return;
    }

    const organizerIds = organizers
      .map((organizer) => organizer._id!)
      .filter((id) => id.toString() !== req.user.id);

    const gameData = { ...value };
    delete gameData.organizerNicknames;
    const newGame = new Game({
      ...gameData,
      organizers: organizerIds,
      createdBy: req.user.id,
    });

    await newGame.save();
    await User.updateMany(
      { _id: { $in: organizerIds } },
      { $addToSet: { roles: 'organizer' } }
    );
    await newGame.populate('createdBy organizers', 'nickname firstName lastName');

    res.status(201).json({
      message: 'Квест создан успешно',
      game: newGame,
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      res.status(409).json({ error: 'Квест с таким названием уже существует' });
      return;
    }

    if (error instanceof MongooseError.ValidationError) {
      res.status(400).json({ errors: Object.values(error.errors).map((err) => err.message) });
      return;
    }

    console.error('Ошибка создания квеста:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const updateGame = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const game = await Game.findById(req.params.id);

    if (!game) {
      res.status(404).json({ error: 'Квест не найден' });
      return;
    }

    // Проверка прав: администратор, создатель или соорганизатор
    if (!isGameModerator(game, req.user)) {
      res.status(403).json({ error: 'У вас нет прав для редактирования этого квеста' });
      return;
    }

    const { error, value } = gameUpdateSchema.validate(req.body);

    if (error) {
      res.status(400).json({ errors: error.details.map((d) => d.message) });
      return;
    }

    const nextStart = value.dateofstart ?? game.dateofstart;
    const nextEnd = value.dateofend ?? game.dateofend;

    if (hasInvalidDateRange(nextStart, nextEnd)) {
      res.status(400).json({ errors: ['Дата окончания должна быть позже даты начала'] });
      return;
    }

    Object.assign(game, value);
    await game.save();

    res.status(200).json({
      message: 'Квест обновлен успешно',
      game,
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      res.status(409).json({ error: 'Квест с таким названием уже существует' });
      return;
    }

    if (error instanceof MongooseError.ValidationError) {
      res.status(400).json({ errors: Object.values(error.errors).map((err) => err.message) });
      return;
    }

    console.error('Ошибка обновления квеста:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const deleteGame = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const game = await Game.findById(req.params.id);

    if (!game) {
      res.status(404).json({ error: 'Квест не найден' });
      return;
    }

    // Удалять игру может администратор, создатель или соорганизатор
    if (!isGameModerator(game, req.user)) {
      res.status(403).json({ error: 'У вас нет прав для удаления этого квеста' });
      return;
    }

    await Game.findByIdAndDelete(req.params.id);

    const applIds = await GameAppl.find({ gameId: req.params.id }).distinct('_id');

    await Task.deleteMany({ gameId: req.params.id });
    await GameTeamProgress.deleteMany({ gameId: req.params.id });
    await GameAppl.deleteMany({ gameId: req.params.id });
    await User.updateMany(
      { gameAppls: { $in: applIds } },
      { $pull: { gameAppls: { $in: applIds } } }
    );

    res.status(200).json({ message: 'Квест удален успешно' });
  } catch (error) {
    console.error('Ошибка удаления квеста:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Опубликовать результаты игры (только для organizer или admin)
export const publishGameResults = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const game = await Game.findById(req.params.id);

    if (!game) {
      res.status(404).json({ error: 'Квест не найден' });
      return;
    }

    // Публиковать результаты может администратор, создатель или соорганизатор
    if (!isGameModerator(game, req.user)) {
      res.status(403).json({ error: 'У вас нет прав для публикации результатов этой игры' });
      return;
    }

    game.published = true;
    await game.save();

    res.status(200).json({
      message: 'Результаты опубликованы успешно',
      game,
    });
  } catch (error) {
    console.error('Ошибка публикации результатов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Добавить соорганизатора игры (админ или создатель)
export const addOrganizer = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const game = await Game.findById(req.params.id);

    if (!game) {
      res.status(404).json({ error: 'Квест не найден' });
      return;
    }

    if (!canManageOrganizers(game, req.user)) {
      res.status(403).json({ error: 'Управлять организаторами может администратор или создатель игры' });
      return;
    }

    const { nickname } = req.body;

    if (!nickname || typeof nickname !== 'string') {
      res.status(400).json({ error: 'Укажите никнейм пользователя' });
      return;
    }

    const organizer = await User.findOne({ nickname: nickname.trim() });

    if (!organizer) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    const organizerId = organizer._id!.toString();

    if (game.createdBy?.toString() === organizerId) {
      res.status(400).json({ error: 'Этот пользователь уже создатель игры' });
      return;
    }

    if ((game.organizers || []).some((id) => id.toString() === organizerId)) {
      res.status(400).json({ error: 'Этот пользователь уже организатор игры' });
      return;
    }

    game.organizers = [...(game.organizers || []), organizer._id as any];
    await game.save();

    // Выдаём роль organizer, чтобы соорганизатор имел доступ к панели управления
    await User.findByIdAndUpdate(organizerId, { $addToSet: { roles: 'organizer' } });

    await game.populate('createdBy organizers', 'nickname firstName lastName');

    res.status(200).json({
      message: 'Организатор добавлен успешно',
      game,
    });
  } catch (error) {
    console.error('Ошибка добавления организатора:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Удалить соорганизатора игры (админ или создатель)
export const removeOrganizer = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const game = await Game.findById(req.params.id);

    if (!game) {
      res.status(404).json({ error: 'Квест не найден' });
      return;
    }

    if (!canManageOrganizers(game, req.user)) {
      res.status(403).json({ error: 'Управлять организаторами может администратор или создатель игры' });
      return;
    }

    const { userId } = req.params;

    game.organizers = (game.organizers || []).filter(
      (id) => id.toString() !== userId
    );
    await game.save();
    await game.populate('createdBy organizers', 'nickname firstName lastName');

    res.status(200).json({
      message: 'Организатор удален успешно',
      game,
    });
  } catch (error) {
    console.error('Ошибка удаления организатора:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Получить логи всех команд по игре.
// Доступ проверяется в middleware canModerateGame:
// администратор видит логи всех игр, организатор - только своих.
export const getGameLogs = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const logs = await TeamLog.find({ game: req.params.id })
      .populate('team', 'name')
      .populate('user', 'nickname firstName lastName')
      .populate('task', 'title')
      .sort('timestamp');

    res.status(200).json(logs);
  } catch (error) {
    console.error('Ошибка загрузки логов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Получить статистику игры (только если published)
export const getGameStatistics = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const gameId = req.params.id;

    const game = await Game.findById(gameId)
      .populate('createdBy', 'nickname')
      .populate('organizers', 'nickname');

    if (!game) {
      res.status(404).json({ error: 'Квест не найден' });
      return;
    }

    // Проверка: результаты должны быть опубликованы, ИЛИ пользователь - модератор игры
    if (!game.published && !isGameModerator(game, req.user)) {
      res.status(403).json({ error: 'Результаты игры еще не опубликованы' });
      return;
    }

    // Получить все прогрессы команд для этой игры
    const progressList = await GameTeamProgress.find({ gameId })
      .populate({
        path: 'gameApplId',
        populate: { path: 'team', populate: { path: 'captain members', select: 'nickname firstName lastName' } },
      })
      .populate('taskOrder', 'title description')
      .populate('completedTasks.submittedBy', 'nickname firstName lastName')
      .populate('timeAdjustments.createdBy', 'nickname');

    // Получить все задания
    const tasks = await Task.find({ gameId }).sort('orderIndex').select('_id title description orderIndex');

    // Построить статистику
    const statistics = progressList.map((progress) => {
      const teamInfo = (progress.gameApplId as any)?.team || {
        name: 'Неизвестная команда',
        captain: null,
        members: [],
      };

      // Штрафы (+) и бонусы (-) организаторов входят в итоговое время
      const adjustmentsTotal = (progress.timeAdjustments || []).reduce(
        (sum, adj) => sum + adj.amount,
        0
      );
      const adjustedTotalTime =
        progress.totalTime !== undefined && progress.totalTime !== null
          ? Math.max(0, progress.totalTime + adjustmentsTotal)
          : null;

      return {
        teamId: (progress.gameApplId as any)?._id,
        teamName: teamInfo.name,
        captain: teamInfo.captain,
        members: teamInfo.members,
        status: progress.status,
        taskResults: progress.taskOrder.map((taskId: any, idx: number) => {
          // На задание может быть несколько попыток: показываем победную
          // (правильный ответ), а если её нет - последнюю попытку
          const attempts = progress.completedTasks.filter(
            (ct) => ct.taskId.toString() === taskId._id?.toString()
          );
          const completed =
            attempts.find((ct) => ct.isCorrect) ?? attempts[attempts.length - 1];

          return {
            taskIndex: idx + 1,
            taskId: taskId._id,
            taskTitle: taskId.title,
            taskDescription: taskId.description,
            completed: !!completed?.isCorrect,
            attempts: attempts.length,
            answer: completed?.answer ?? null,
            isCorrect: completed?.isCorrect ?? false,
            submittedBy: completed?.submittedBy ?? null,
            timeSpent: completed?.timeSpent ?? null,
            completedAt: completed?.completedAt ?? null,
          };
        }),
        totalTasks: progress.taskOrder.length,
        completedTasks: progress.completedTasks.length,
        baseTotalTime: progress.totalTime ?? null,
        timeAdjustments: progress.timeAdjustments || [],
        adjustmentsTotal,
        totalTime: adjustedTotalTime,
        gameStartedAt: progress.gameStartedAt,
        gameFinishedAt: progress.gameFinishedAt,
      };
    });

    // Отсортировать по итоговому времени с учётом штрафов и бонусов
    statistics.sort((a, b) => {
      if (a.status !== 'completed' || b.status !== 'completed') {
        return a.status === 'completed' ? -1 : 1;
      }
      return (a.totalTime ?? Infinity) - (b.totalTime ?? Infinity);
    });

    // Присвоить места завершившим командам
    let place = 0;
    const statisticsWithPlace = statistics.map((s) => ({
      ...s,
      place: s.status === 'completed' ? ++place : null,
    }));

    res.status(200).json({
      game: {
        id: game._id,
        title: game.title,
        description: game.description,
        published: game.published,
        createdBy: game.createdBy,
        organizers: game.organizers || [],
        taskOrderMode: game.taskOrderMode || 'linear',
        dateofstart: game.dateofstart,
        dateofend: game.dateofend,
      },
      tasks,
      statistics: statisticsWithPlace,
      totalTeams: statisticsWithPlace.length,
      completedTeams: statisticsWithPlace.filter((s) => s.status === 'completed').length,
    });
  } catch (error) {
    console.error('Ошибка получения статистики:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};
