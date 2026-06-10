import { Response } from 'express';
import Joi from 'joi';
import { Task } from '../models/Task';
import { Game } from '../models/Game';
import { AuthenticatedRequest } from '../middleware/auth';
import { isGameModerator } from '../services/gamePermissions';

// Может ли пользователь модерировать игру задания: админ, создатель или соорганизатор
const canModerateTaskGame = async (
  gameId: any,
  user: { id?: string; roles?: string[] }
): Promise<boolean> => {
  const game = await Game.findById(gameId);
  return !!game && isGameModerator(game, user);
};

const taskSchema = Joi.object({
  title: Joi.string().required().trim(),
  description: Joi.string().required(),
  answers: Joi.array().items(Joi.string()).min(1).required(),
  hints: Joi.array().items(Joi.string()).optional(),
  orderIndex: Joi.number().required(),
  timeLimit: Joi.number().optional(),
  points: Joi.number().optional(),
});

export const createTask = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { error, value } = taskSchema.validate(req.body);

    if (error) {
      res.status(400).json({ errors: error.details.map((d) => d.message) });
      return;
    }

    const { gameId } = req.params;

    // Проверить, что игра существует и принадлежит администратору
    const game = await Game.findById(gameId);

    if (!game) {
      res.status(404).json({ error: 'Квест не найден' });
      return;
    }

    const newTask = new Task({
      gameId,
      ...value,
    });

    await newTask.save();

    res.status(201).json({
      message: 'Задание создано успешно',
      task: newTask,
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const getGameTasks = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { gameId } = req.params;

    const tasks = await Task.find({ gameId }).sort('orderIndex');

    res.status(200).json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const getTaskById = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { taskId } = req.params;

    const task = await Task.findById(taskId);

    if (!task) {
      res.status(404).json({ error: 'Задание не найдено' });
      return;
    }

    res.status(200).json(task);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const updateTask = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { taskId } = req.params;
    const { error, value } = taskSchema.validate(req.body, {
      presence: 'optional',
    });

    if (error) {
      res.status(400).json({ errors: error.details.map((d) => d.message) });
      return;
    }

    const existingTask = await Task.findById(taskId);

    if (!existingTask) {
      res.status(404).json({ error: 'Задание не найдено' });
      return;
    }

    if (!(await canModerateTaskGame(existingTask.gameId, req.user))) {
      res.status(403).json({ error: 'У вас нет прав для редактирования заданий этой игры' });
      return;
    }

    const task = await Task.findByIdAndUpdate(taskId, value, { new: true });

    res.status(200).json({
      message: 'Задание обновлено успешно',
      task,
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const deleteTask = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { taskId } = req.params;

    const task = await Task.findById(taskId);

    if (!task) {
      res.status(404).json({ error: 'Задание не найдено' });
      return;
    }

    if (!(await canModerateTaskGame(task.gameId, req.user))) {
      res.status(403).json({ error: 'У вас нет прав для удаления заданий этой игры' });
      return;
    }

    await Task.findByIdAndDelete(taskId);

    res.status(200).json({ message: 'Задание удалено успешно' });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const reorderTasks = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { gameId } = req.params;
    const { taskIds } = req.body; // Массив Task IDs в новом порядке

    if (!Array.isArray(taskIds)) {
      res.status(400).json({ error: 'taskIds должен быть массивом' });
      return;
    }

    // Обновить orderIndex для каждого задания
    await Promise.all(
      taskIds.map((taskId, index) =>
        Task.findByIdAndUpdate(taskId, { orderIndex: index })
      )
    );

    res.status(200).json({
      message: 'Порядок заданий обновлен',
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};
