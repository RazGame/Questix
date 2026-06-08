import { Response } from 'express';
import { Error as MongooseError } from 'mongoose';
import Joi from 'joi';
import { Game } from '../models/Game';
import { GameAppl } from '../models/GameAppl';
import { GameTeamProgress } from '../models/GameTeamProgress';
import { Task } from '../models/Task';
import { User } from '../models/User';
import { AuthenticatedRequest } from '../middleware/auth';
import { hasInvalidDateRange } from '../services/questState';

const gameSchema = Joi.object({
  title: Joi.string().required().trim(),
  city: Joi.string().required().trim(),
  dateofstart: Joi.date().required(),
  dateofend: Joi.date().required(),
  deposit: Joi.string().required().trim(),
  prize: Joi.string().required().trim(),
  description: Joi.string().required().trim(),
});

export const getAllGames = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const games = await Game.find()
      .populate('createdBy', 'nickname')
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
      .populate('createdBy', 'nickname')
      .populate({
        path: 'gameAppls',
        populate: { path: 'userId', select: 'nickname firstName lastName' },
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
    const { error, value } = gameSchema.validate(req.body);

    if (error) {
      res.status(400).json({ errors: error.details.map((d) => d.message) });
      return;
    }

    if (hasInvalidDateRange(value.dateofstart, value.dateofend)) {
      res.status(400).json({ errors: ['Дата окончания должна быть позже даты начала'] });
      return;
    }

    const newGame = new Game({
      ...value,
      createdBy: req.user.id,
    });

    await newGame.save();

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
    const { error, value } = gameSchema.validate(req.body, {
      presence: 'optional',
    });

    if (error) {
      res.status(400).json({ errors: error.details.map((d) => d.message) });
      return;
    }

    const game = await Game.findById(req.params.id);

    if (!game) {
      res.status(404).json({ error: 'Квест не найден' });
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
    const game = await Game.findByIdAndDelete(req.params.id);

    if (!game) {
      res.status(404).json({ error: 'Квест не найден' });
      return;
    }

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
