import { Response } from 'express';
import Joi from 'joi';
import { GameAppl } from '../models/GameAppl';
import { User } from '../models/User';
import { Game } from '../models/Game';
import { Team } from '../models/Team';
import { AuthenticatedRequest } from '../middleware/auth';
import { canApplyToQuest } from '../services/questState';
import { isGameModerator } from '../services/gamePermissions';

const applSchema = Joi.object({
  gameId: Joi.string().required(),
});

export const createAppl = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { error, value } = applSchema.validate(req.body);

    if (error) {
      res.status(400).json({ errors: error.details.map((d) => d.message) });
      return;
    }

    const game = await Game.findById(value.gameId);

    if (!game) {
      res.status(404).json({ error: 'Квест не найден' });
      return;
    }

    const canApply = canApplyToQuest(game);

    if (!canApply.ok) {
      res.status(400).json({ error: canApply.error });
      return;
    }

    // Заявка подаётся от команды: пользователь должен быть капитаном
    const team = await Team.findOne({ captain: req.user.id });

    if (!team) {
      res.status(400).json({
        error: 'Заявку может подать только капитан команды. Сначала создайте команду',
      });
      return;
    }

    // Проверить, не подана ли уже заявка этой командой или этим пользователем
    const existingAppl = await GameAppl.findOne({
      gameId: value.gameId,
      $or: [{ userId: req.user.id }, { team: team._id }],
    });

    if (existingAppl) {
      res.status(409).json({ error: 'Ваша команда уже подала заявку на этот квест' });
      return;
    }

    const newAppl = new GameAppl({
      userId: req.user.id,
      gameId: value.gameId,
      team: team._id,
      teamName: team.name,
    });

    await newAppl.save();

    // Добавить заявку в массив квеста и пользователя
    await Game.findByIdAndUpdate(value.gameId, {
      $addToSet: { gameAppls: newAppl._id },
    });

    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { gameAppls: newAppl._id },
    });

    res.status(201).json({
      message: 'Заявка подана успешно',
      appl: newAppl,
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      res.status(409).json({ error: 'Вы уже подали заявку на этот квест' });
      return;
    }

    console.error('Ошибка создания заявки:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const getMyAppls = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    // Показываем заявки, поданные пользователем, и заявки команд, где он участник
    const teamIds = await Team.find({
      $or: [{ captain: req.user.id }, { members: req.user.id }],
    }).distinct('_id');

    const appls = await GameAppl.find({
      $or: [{ userId: req.user.id }, { team: { $in: teamIds } }],
    })
      .populate('gameId', 'title city prize deposit dateofstart dateofend published')
      .populate('userId', 'nickname firstName lastName')
      .populate('team', 'name captain members');

    res.status(200).json(appls);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const updateApplStatus = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { status } = req.body;

    if (!['pending', 'approved', 'rejected', 'completed'].includes(status)) {
      res.status(400).json({ error: 'Неверный статус' });
      return;
    }

    const existingAppl = await GameAppl.findById(req.params.id);

    if (!existingAppl) {
      res.status(404).json({ error: 'Заявка не найдена' });
      return;
    }

    // Модерировать заявки может админ, создатель игры или соорганизатор
    const game = await Game.findById(existingAppl.gameId);

    if (!game || !isGameModerator(game, req.user)) {
      res.status(403).json({ error: 'У вас нет прав для модерирования заявок этой игры' });
      return;
    }

    const appl = await GameAppl.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    )
      .populate('gameId')
      .populate('userId');

    if (!appl) {
      res.status(404).json({ error: 'Заявка не найдена' });
      return;
    }

    res.status(200).json({
      message: 'Статус обновлен успешно',
      appl,
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const getGameAppls = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const appls = await GameAppl.find({ gameId: req.params.gameId })
      .populate('userId', 'nickname firstName lastName city phone')
      .populate('gameId', 'title');

    res.status(200).json(appls);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};
