import { Response } from 'express';
import Joi from 'joi';
import { Team } from '../models/Team';
import { User } from '../models/User';
import { AuthenticatedRequest } from '../middleware/auth';

const createTeamSchema = Joi.object({
  name: Joi.string().required().trim(),
  members: Joi.array().items(Joi.string()).optional(),
});

const addMemberSchema = Joi.object({
  memberId: Joi.string(),
  nickname: Joi.string().trim(),
}).or('memberId', 'nickname');

const transferCaptainSchema = Joi.object({
  newCaptainId: Joi.string().required(),
});

const updateTeamSchema = Joi.object({
  name: Joi.string().required().trim(),
});

// Создание новой команды (капитан)
export const createTeam = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { error, value } = createTeamSchema.validate(req.body);

    if (error) {
      res.status(400).json({ errors: error.details.map((d) => d.message) });
      return;
    }

    const userId = req.user?.id;

    // Проверка, является ли пользователь капитаном одной команды
    const existingCaptainTeam = await Team.findOne({ captain: userId });
    if (existingCaptainTeam) {
      res.status(400).json({ error: 'Вы уже являетесь капитаном другой команды' });
      return;
    }

    const members = value.members || [];
    if (!members.includes(userId)) {
      members.push(userId);
    }

    const newTeam = new Team({
      name: value.name,
      captain: userId,
      members,
    });

    await newTeam.save();
    await newTeam.populate('captain members', 'nickname firstName lastName');

    // Обновляем роль пользователя на team_captain
    await User.findByIdAndUpdate(userId, { $addToSet: { roles: 'team_captain' } });

    res.status(201).json({
      message: 'Команда создана успешно',
      team: newTeam,
    });
  } catch (error) {
    console.error('Ошибка создания команды:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Добавить участника в команду
export const addMember = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { error, value } = addMemberSchema.validate(req.body);

    if (error) {
      res.status(400).json({ errors: error.details.map((d) => d.message) });
      return;
    }

    const teamId = req.params.teamId;
    const userId = req.user?.id;

    // Проверка, что текущий пользователь - капитан команды
    const team = await Team.findById(teamId);
    if (!team) {
      res.status(404).json({ error: 'Команда не найдена' });
      return;
    }

    if (team.captain.toString() !== userId) {
      res.status(403).json({ error: 'У вас нет прав для управления этой командой' });
      return;
    }

    // Найти участника по ID или никнейму
    const member = value.memberId
      ? await User.findById(value.memberId)
      : await User.findOne({ nickname: value.nickname });

    if (!member) {
      res.status(404).json({ error: 'Участник не найден' });
      return;
    }

    const memberId = member._id!.toString();

    // Добавить участника если его еще нет
    if (!team.members.some((id) => id.toString() === memberId)) {
      team.members.push(member._id as any);
      await team.save();
    }

    await team.populate('captain members', 'nickname firstName lastName');

    res.status(200).json({
      message: 'Участник добавлен успешно',
      team,
    });
  } catch (error) {
    console.error('Ошибка добавления участника:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const updateTeam = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { error, value } = updateTeamSchema.validate(req.body);

    if (error) {
      res.status(400).json({ errors: error.details.map((d) => d.message) });
      return;
    }

    const team = await Team.findById(req.params.teamId);

    if (!team) {
      res.status(404).json({ error: 'Команда не найдена' });
      return;
    }

    if (team.captain.toString() !== req.user.id) {
      res.status(403).json({ error: 'У вас нет прав для управления этой командой' });
      return;
    }

    team.name = value.name;
    await team.save();
    await team.populate('captain members', 'nickname firstName lastName');

    res.status(200).json({
      message: 'Команда обновлена успешно',
      team,
    });
  } catch (error) {
    console.error('Ошибка обновления команды:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Удалить команду (только капитан)
export const deleteTeam = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const team = await Team.findById(req.params.teamId);

    if (!team) {
      res.status(404).json({ error: 'Команда не найдена' });
      return;
    }

    if (team.captain.toString() !== req.user.id) {
      res.status(403).json({ error: 'У вас нет прав для удаления этой команды' });
      return;
    }

    await Team.findByIdAndDelete(team._id);
    await User.findByIdAndUpdate(team.captain, { $pull: { roles: 'team_captain' } });

    res.status(200).json({ message: 'Команда удалена успешно' });
  } catch (error) {
    console.error('Ошибка удаления команды:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Удалить участника из команды
export const removeMember = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const teamId = req.params.teamId;
    const userId = req.user?.id;
    const memberId = req.params.memberId;

    const team = await Team.findById(teamId);
    if (!team) {
      res.status(404).json({ error: 'Команда не найдена' });
      return;
    }

    // Проверка, что текущий пользователь - капитан команды
    if (team.captain.toString() !== userId) {
      res.status(403).json({ error: 'У вас нет прав для управления этой командой' });
      return;
    }

    // Нельзя удалить капитана
    if (memberId === team.captain.toString()) {
      res.status(400).json({ error: 'Нельзя удалить капитана из команды' });
      return;
    }

    team.members = team.members.filter((id) => id.toString() !== memberId);
    await team.save();
    await team.populate('captain members', 'nickname firstName lastName');

    res.status(200).json({
      message: 'Участник удален успешно',
      team,
    });
  } catch (error) {
    console.error('Ошибка удаления участника:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Выйти из команды (участник, не капитан)
export const leaveTeam = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const teamId = req.params.teamId;
    const userId = req.user?.id;

    const team = await Team.findById(teamId);
    if (!team) {
      res.status(404).json({ error: 'Команда не найдена' });
      return;
    }

    if (team.captain.toString() === userId) {
      res.status(400).json({
        error: 'Капитан не может выйти из команды. Сначала передайте права капитана',
      });
      return;
    }

    if (!team.members.some((id) => id.toString() === userId)) {
      res.status(400).json({ error: 'Вы не состоите в этой команде' });
      return;
    }

    team.members = team.members.filter((id) => id.toString() !== userId);
    await team.save();

    res.status(200).json({ message: 'Вы вышли из команды' });
  } catch (error) {
    console.error('Ошибка выхода из команды:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Передать права капитана
export const transferCaptain = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { error, value } = transferCaptainSchema.validate(req.body);

    if (error) {
      res.status(400).json({ errors: error.details.map((d) => d.message) });
      return;
    }

    const teamId = req.params.teamId;
    const userId = req.user?.id;
    const newCaptainId = value.newCaptainId;

    const team = await Team.findById(teamId);
    if (!team) {
      res.status(404).json({ error: 'Команда не найдена' });
      return;
    }

    // Проверка, что текущий пользователь - капитан
    if (team.captain.toString() !== userId) {
      res.status(403).json({ error: 'У вас нет прав для управления этой командой' });
      return;
    }

    // Проверка, что новый капитан - участник команды
    if (!team.members.find((id) => id.toString() === newCaptainId)) {
      res.status(400).json({ error: 'Новый капитан должен быть участником команды' });
      return;
    }

    team.captain = newCaptainId;
    await team.save();

    // Обновляем роли пользователей
    await User.findByIdAndUpdate(userId, { $pull: { roles: 'team_captain' } });
    await User.findByIdAndUpdate(newCaptainId, { $addToSet: { roles: 'team_captain' } });

    await team.populate('captain members', 'nickname firstName lastName');

    res.status(200).json({
      message: 'Права капитана переданы успешно',
      team,
    });
  } catch (error) {
    console.error('Ошибка передачи прав капитана:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Получить информацию о команде
export const getTeam = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const teamId = req.params.teamId;

    const team = await Team.findById(teamId)
      .populate('captain', 'nickname firstName lastName')
      .populate('members', 'nickname firstName lastName')
      .populate('gameAppl');

    if (!team) {
      res.status(404).json({ error: 'Команда не найдена' });
      return;
    }

    res.status(200).json(team);
  } catch (error) {
    console.error('Ошибка загрузки команды:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const getTeamByUser = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.params.userId;

    const team = await Team.findOne({
      $or: [{ captain: userId }, { members: userId }],
    })
      .populate('captain', 'nickname firstName lastName')
      .populate('members', 'nickname firstName lastName')
      .populate('gameAppl');

    if (!team) {
      res.status(200).json(null);
      return;
    }

    res.status(200).json(team);
  } catch (error) {
    console.error('Ошибка загрузки команды пользователя:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Получить все команды пользователя (где он капитан или участник)
export const getUserTeams = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;

    const teams = await Team.find({
      $or: [{ captain: userId }, { members: userId }],
    })
      .populate('captain', 'nickname firstName lastName')
      .populate('members', 'nickname firstName lastName')
      .populate('gameAppl');

    res.status(200).json(teams);
  } catch (error) {
    console.error('Ошибка загрузки команд:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};
