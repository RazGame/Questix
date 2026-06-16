import { Response } from 'express';
import { GameTeamProgress, IGameTeamProgress } from '../models/GameTeamProgress';
import { Task } from '../models/Task';
import { Game } from '../models/Game';
import { GameAppl } from '../models/GameAppl';
import { Team } from '../models/Team';
import { TeamLog } from '../models/TeamLog';
import { AuthenticatedRequest } from '../middleware/auth';
import { canPlayQuest } from '../services/questState';
import { isGameModerator } from '../services/gamePermissions';

// Перемешивание Фишера-Йетса для случайного порядка заданий
const shuffle = <T>(items: T[]): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

// Проверка: пользователь — капитан или участник команды, подавшей заявку.
// Все участники команды могут играть и отправлять ответы.
const isTeamMember = async (
  gameAppl: { team?: any; userId: any },
  userId: string
): Promise<boolean> => {
  if (!gameAppl.team) {
    return gameAppl.userId?.toString() === userId;
  }

  const team = await Team.findById(gameAppl.team);

  if (!team) {
    return false;
  }

  return (
    team.captain.toString() === userId ||
    team.members.some((id) => id.toString() === userId)
  );
};

// Начать игру - создать прогресс с рандомным или установленным порядком заданий
export const startGame = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { gameApplId } = req.body;

    // Получить заявку
    const gameAppl = await GameAppl.findById(gameApplId);

    if (!gameAppl) {
      res.status(404).json({ error: 'Заявка не найдена' });
      return;
    }

    // Играть могут все участники команды (или сам игрок в одиночном квесте)
    if (!(await isTeamMember(gameAppl, req.user.id))) {
      res.status(403).json({ error: 'Доступ запрещён: вы не участник этой заявки' });
      return;
    }

    // Проверить, что игра начиналась
    const game = await Game.findById(gameAppl.gameId);

    if (!game) {
      res.status(404).json({ error: 'Квест не найден' });
      return;
    }

    const canPlay = canPlayQuest(game);

    if (!canPlay.ok) {
      res.status(400).json({ error: canPlay.error });
      return;
    }

    if (gameAppl.status !== 'approved') {
      res.status(400).json({ error: 'Заявка не одобрена' });
      return;
    }

    // Индивидуальное время старта команды (линейный режим):
    // команда не может приступить раньше назначенного времени
    if (gameAppl.startAt && new Date() < gameAppl.startAt) {
      res.status(400).json({
        error: `Ваша команда может стартовать в ${gameAppl.startAt.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Europe/Moscow',
        })} (МСК)`,
        startAt: gameAppl.startAt,
      });
      return;
    }

    // Проверить, что прогресс еще не создан
    const existingProgress = await GameTeamProgress.findOne({ gameApplId });

    if (existingProgress) {
      res.status(200).json({ progress: existingProgress });
      return;
    }

    // Получить все задания квеста
    const tasks = await Task.find({ gameId: gameAppl.gameId }).sort('orderIndex');

    if (tasks.length === 0) {
      res.status(400).json({ error: 'В этом квесте нет заданий' });
      return;
    }

    const linearOrder = tasks.map((t) => t._id!);

    // Порядок заданий зависит от режима игры
    let taskOrder: any[] = linearOrder;

    if (game.taskOrderMode === 'random') {
      taskOrder = shuffle(linearOrder);
    } else if (game.taskOrderMode === 'manual') {
      const validTaskIds = new Set(linearOrder.map((id) => id.toString()));
      const manualOrder = (gameAppl.taskOrder || []).filter((id) =>
        validTaskIds.has(id.toString())
      );

      // Используем ручной порядок только если он покрывает все задания,
      // иначе откатываемся к линейному
      taskOrder = manualOrder.length === linearOrder.length ? manualOrder : linearOrder;
    }

    // Создать прогресс: привязан к заявке; teamId пуст для одиночного квеста
    const progress = new GameTeamProgress({
      gameApplId,
      gameId: gameAppl.gameId,
      teamId: gameAppl.team || null,
      userId: gameAppl.userId,
      taskOrder,
      status: 'in_progress',
      gameStartedAt: new Date(),
    });

    await progress.save();

    // Логировать старт игры
    const teamLog = new TeamLog({
      team: gameAppl.team || null,
      gameAppl: gameApplId,
      game: gameAppl.gameId,
      user: req.user.id,
      task: taskOrder[0], // Первое задание
      action: 'game_started',
      timestamp: new Date(),
    });

    await teamLog.save();

    res.status(201).json({
      message: 'Игра начата',
      progress,
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      const existingProgress = await GameTeamProgress.findOne({
        gameApplId: req.body.gameApplId,
      });

      if (existingProgress) {
        res.status(200).json({ progress: existingProgress });
        return;
      }
    }

    console.error('Ошибка старта игры:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Получить текущее задание для команды
export const getCurrentTask = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { gameApplId } = req.params;

    const progress = await GameTeamProgress.findOne({ gameApplId });

    if (!progress) {
      res.status(404).json({ error: 'Прогресс не найден. Начните игру!' });
      return;
    }

    // Доступ есть у всех участников команды
    const gameAppl = await GameAppl.findById(gameApplId);

    if (!gameAppl || !(await isTeamMember(gameAppl, req.user.id))) {
      res.status(403).json({ error: 'Доступ запрещен' });
      return;
    }

    // Если все задания завершены, результат можно открыть и после окончания квеста.
    if (
      progress.status === 'completed' ||
      progress.currentTaskIndex >= progress.taskOrder.length
    ) {
      res.status(200).json({
        status: 'completed',
        message: 'Вы завершили все задания!',
        totalTime: progress.totalTime,
      });
      return;
    }

    const game = await Game.findById(progress.gameId);

    if (!game) {
      res.status(404).json({ error: 'Квест не найден' });
      return;
    }

    const canPlay = canPlayQuest(game);

    if (!canPlay.ok) {
      res.status(400).json({ error: canPlay.error });
      return;
    }

    const currentTaskId = progress.taskOrder[progress.currentTaskIndex];
    const task = await Task.findById(currentTaskId);

    if (!task) {
      res.status(404).json({ error: 'Задание не найдено' });
      return;
    }

    const previousTaskId = progress.currentTaskIndex > 0
      ? progress.taskOrder[progress.currentTaskIndex - 1]
      : null;
    const previousCompletedAt = previousTaskId
      ? [...progress.completedTasks]
          .reverse()
          .find(
            (completedTask) =>
              completedTask.isCorrect &&
              completedTask.taskId.toString() === previousTaskId.toString()
          )?.completedAt
      : null;
    const taskStartedAt = previousCompletedAt || progress.gameStartedAt;
    const currentTaskElapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - taskStartedAt.getTime()) / 1000)
    );
    const availableHints = (task.hints || []).filter((hint: any) => {
      const delayMinutes = typeof hint === 'string' ? 0 : hint.delayMinutes || 0;
      return delayMinutes * 60 <= currentTaskElapsedSeconds;
    });

    // НЕ отправляем ответы клиенту!
    const taskWithoutAnswers = {
      _id: task._id,
      title: task.title,
      description: task.description,
      hints: availableHints,
      timeLimit: task.timeLimit,
      orderIndex: progress.currentTaskIndex + 1,
      totalTasks: progress.taskOrder.length,
      taskStartedAt,
      currentTaskElapsedSeconds,
    };

    res.status(200).json({
      status: 'in_progress',
      currentTaskIndex: progress.currentTaskIndex,
      totalTasks: progress.taskOrder.length,
      task: taskWithoutAnswers,
    });
  } catch (error) {
    console.error('Ошибка получения текущего задания:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Отправить ответ на задание
export const submitAnswer = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { gameApplId } = req.params;
    const { answer } = req.body;

    if (!answer) {
      res.status(400).json({ error: 'Ответ обязателен' });
      return;
    }

    const progress = await GameTeamProgress.findOne({ gameApplId });

    if (!progress) {
      res.status(404).json({ error: 'Прогресс не найден' });
      return;
    }

    // Отправлять ответы могут все участники команды
    const gameAppl = await GameAppl.findById(gameApplId);

    if (!gameAppl || !(await isTeamMember(gameAppl, req.user.id))) {
      res.status(403).json({ error: 'Доступ запрещен' });
      return;
    }

    if (progress.status === 'completed') {
      res.status(400).json({ error: 'Игра уже завершена' });
      return;
    }

    const game = await Game.findById(progress.gameId);

    if (!game) {
      res.status(404).json({ error: 'Квест не найден' });
      return;
    }

    const canPlay = canPlayQuest(game);

    if (!canPlay.ok) {
      if (canPlay.state === 'finished') {
        progress.status = 'abandoned';
        progress.gameFinishedAt = new Date();
        progress.totalTime = Math.floor(
          (progress.gameFinishedAt.getTime() - progress.gameStartedAt.getTime()) / 1000
        );
        await progress.save();
      }

      res.status(400).json({
        error: canPlay.state === 'finished' ? 'Время квеста истекло' : canPlay.error,
      });
      return;
    }

    // Получить текущее задание
    const currentTaskId = progress.taskOrder[progress.currentTaskIndex];
    const task = await Task.findById(currentTaskId);

    if (!task) {
      res.status(404).json({ error: 'Задание не найдено' });
      return;
    }

    // Проверить ответ (case-insensitive)
    const normalizedAnswer = answer.toLowerCase().trim();
    const isCorrect = task.answers.includes(normalizedAnswer);

    // Вычислить время прохождения задания
    const lastCompletedTask = progress.completedTasks[progress.completedTasks.length - 1];
    const timeSpent = lastCompletedTask
      ? Math.floor((new Date().getTime() - lastCompletedTask.completedAt.getTime()) / 1000)
      : Math.floor((new Date().getTime() - progress.gameStartedAt.getTime()) / 1000);

    // Добавить результат: фиксируем, кто из команды отправил ответ
    progress.completedTasks.push({
      taskId: currentTaskId,
      answer: normalizedAnswer,
      isCorrect,
      submittedBy: req.user.id,
      timeSpent,
      completedAt: new Date(),
    });

    // Логировать попытку ответа
    const answerLog = new TeamLog({
      team: progress.teamId,
      gameAppl: gameApplId,
      game: progress.gameId,
      user: req.user.id,
      task: currentTaskId,
      action: 'task_answered',
      answer: normalizedAnswer,
      isCorrect,
      timestamp: new Date(),
    });

    if (isCorrect) {
      // Перейти к следующему заданию
      progress.currentTaskIndex += 1;

      // Логировать правильный ответ
      answerLog.action = 'task_correct';
      await answerLog.save();

      // Если это было последнее задание
      if (progress.currentTaskIndex >= progress.taskOrder.length) {
        progress.status = 'completed';
        progress.gameFinishedAt = new Date();
        progress.totalTime = Math.floor(
          (progress.gameFinishedAt.getTime() - progress.gameStartedAt.getTime()) / 1000
        );

        // Логировать завершение игры
        const finishLog = new TeamLog({
          team: progress.teamId,
          gameAppl: gameApplId,
          game: progress.gameId,
          user: req.user.id,
          task: currentTaskId,
          action: 'game_finished',
          timestamp: new Date(),
        });

        await finishLog.save();
      } else {
        // Логировать переход к следующему заданию
        const nextTaskLog = new TeamLog({
          team: progress.teamId,
          gameAppl: gameApplId,
          game: progress.gameId,
          user: req.user.id,
          task: progress.taskOrder[progress.currentTaskIndex],
          action: 'task_passed',
          timestamp: new Date(),
        });

        await nextTaskLog.save();
      }
    } else {
      // Логировать неправильный ответ
      answerLog.action = 'task_incorrect';
      await answerLog.save();
    }

    await progress.save();

    res.status(200).json({
      message: isCorrect ? 'Правильно!' : 'Неверно! Попробуйте еще раз.',
      isCorrect,
      nextTask: isCorrect && progress.currentTaskIndex < progress.taskOrder.length,
    });
  } catch (error) {
    console.error('Ошибка отправки ответа:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Получить прогресс команды
export const getProgress = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { gameApplId } = req.params;

    const progress = await GameTeamProgress.findOne({ gameApplId })
      .populate('taskOrder')
      .populate('userId', 'nickname')
      .populate('completedTasks.submittedBy', 'nickname firstName lastName');

    if (!progress) {
      res.status(404).json({ error: 'Прогресс не найден' });
      return;
    }

    // Доступ: участники команды или администратор
    const roles = req.user?.roles || [];
    if (!roles.includes('admin')) {
      const gameAppl = await GameAppl.findById(gameApplId);

      if (!gameAppl || !(await isTeamMember(gameAppl, req.user.id))) {
        res.status(403).json({ error: 'Доступ запрещен' });
        return;
      }
    }

    res.status(200).json(progress);
  } catch (error) {
    console.error('Ошибка получения прогресса:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Admin: Установить порядок заданий для конкретной команды
export const setTeamTaskOrder = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { gameApplId } = req.params;
    const { taskIds } = req.body;

    if (!Array.isArray(taskIds)) {
      res.status(400).json({ error: 'taskIds должен быть массивом' });
      return;
    }

    const progress = await GameTeamProgress.findOneAndUpdate(
      { gameApplId },
      { taskOrder: taskIds },
      { new: true }
    );

    if (!progress) {
      res.status(404).json({ error: 'Прогресс не найден' });
      return;
    }

    res.status(200).json({
      message: 'Порядок заданий установлен',
      progress,
    });
  } catch (error) {
    console.error('Ошибка установки порядка заданий:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Админ/организатор: добавить штраф (amount > 0) или бонус (amount < 0)
// к итоговому времени команды. Корректировки видны в статистике.
export const adjustTeamTime = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { gameApplId } = req.params;
    const { amount, reason } = req.body;

    if (!Number.isInteger(amount) || amount === 0) {
      res.status(400).json({ error: 'amount должен быть целым числом секунд (положительным для штрафа, отрицательным для бонуса)' });
      return;
    }

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      res.status(400).json({ error: 'Укажите причину штрафа или бонуса' });
      return;
    }

    const progress = await GameTeamProgress.findOne({ gameApplId });

    if (!progress) {
      res.status(404).json({ error: 'Прогресс команды не найден' });
      return;
    }

    const game = await Game.findById(progress.gameId);

    if (!game || !isGameModerator(game, req.user)) {
      res.status(403).json({ error: 'Корректировать время может администратор или организатор игры' });
      return;
    }

    progress.timeAdjustments.push({
      amount,
      reason: reason.trim(),
      createdBy: req.user.id as any,
      createdAt: new Date(),
    });

    await progress.save();
    await progress.populate('timeAdjustments.createdBy', 'nickname');

    res.status(200).json({
      message: amount > 0 ? 'Штраф добавлен' : 'Бонус добавлен',
      progress,
    });
  } catch (error) {
    console.error('Ошибка корректировки времени:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Admin: Получить результаты всех команд по игре
export const getGameResults = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { gameId } = req.params;

    const results = await GameTeamProgress.find({ gameId })
      .populate('userId', 'nickname firstName lastName')
      .populate({ path: 'gameApplId', select: 'teamName team', populate: { path: 'team', select: 'name' } })
      .populate('taskOrder')
      .populate('timeAdjustments.createdBy', 'nickname')
      .sort('totalTime');

    res.status(200).json(results);
  } catch (error) {
    console.error('Ошибка получения результатов игры:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};
