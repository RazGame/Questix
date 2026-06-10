import { Response } from 'express';
import { GameTeamProgress, IGameTeamProgress } from '../models/GameTeamProgress';
import { Task } from '../models/Task';
import { Game } from '../models/Game';
import { GameAppl } from '../models/GameAppl';
import { Team } from '../models/Team';
import { TeamLog } from '../models/TeamLog';
import { AuthenticatedRequest } from '../middleware/auth';
import { canPlayQuest } from '../services/questState';

// Проверка: пользователь — капитан или участник команды, подавшей заявку.
// Все участники команды могут играть и отправлять ответы.
const isTeamMember = async (
  gameAppl: { team?: any; userId: any },
  userId: string
): Promise<boolean> => {
  if (gameAppl.userId?.toString() === userId) {
    return true;
  }

  if (!gameAppl.team) {
    return false;
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

    // Играть могут все участники команды, а не только капитан
    if (!(await isTeamMember(gameAppl, req.user.id))) {
      res.status(403).json({ error: 'Доступ запрещен: вы не состоите в команде этой заявки' });
      return;
    }

    if (!gameAppl.team) {
      res.status(400).json({ error: 'Заявка не привязана к команде' });
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

    const taskOrder = tasks.map(t => t._id!);

    // Создать прогресс: он привязан к команде и к заявке команды
    const progress = new GameTeamProgress({
      gameApplId,
      gameId: gameAppl.gameId,
      teamId: gameAppl.team,
      userId: gameAppl.userId,
      taskOrder,
      status: 'in_progress',
      gameStartedAt: new Date(),
    });

    await progress.save();

    // Логировать старт игры
    const teamLog = new TeamLog({
      team: gameAppl.team,
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
        totalPoints: progress.totalPoints,
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

    // НЕ отправляем ответы клиенту!
    const taskWithoutAnswers = {
      _id: task._id,
      title: task.title,
      description: task.description,
      hints: task.hints,
      timeLimit: task.timeLimit,
      orderIndex: progress.currentTaskIndex + 1,
      totalTasks: progress.taskOrder.length,
    };

    res.status(200).json({
      status: 'in_progress',
      currentTaskIndex: progress.currentTaskIndex,
      totalTasks: progress.taskOrder.length,
      task: taskWithoutAnswers,
    });
  } catch (error) {
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
      progress.totalPoints += task.points || 10;

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
      totalPoints: progress.totalPoints,
      nextTask: isCorrect && progress.currentTaskIndex < progress.taskOrder.length,
    });
  } catch (error) {
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
      .populate('taskOrder')
      .sort('-totalPoints');

    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};
