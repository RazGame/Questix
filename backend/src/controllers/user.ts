import { User } from '../models/User';
import { Response } from 'express';
import Joi from 'joi';
import { AuthenticatedRequest } from '../middleware/auth';

const ALLOWED_ROLES = ['user', 'admin', 'organizer', 'team_captain'];

const updateRolesSchema = Joi.object({
  roles: Joi.array()
    .items(Joi.string().valid(...ALLOWED_ROLES))
    .min(1)
    .required(),
});

const updateProfileSchema = Joi.object({
  firstName: Joi.string().trim(),
  lastName: Joi.string().trim(),
  nickname: Joi.string().trim(),
  city: Joi.string().trim(),
  phone: Joi.string().trim(),
}).min(1);

export const getAllUsers = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const users = await User.find().select('-hashed_pwd');
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Admin: назначить роли пользователю
export const updateUserRoles = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { error, value } = updateRolesSchema.validate(req.body);

    if (error) {
      res.status(400).json({ errors: error.details.map((d) => d.message) });
      return;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { roles: value.roles },
      { new: true }
    ).select('-hashed_pwd');

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    res.status(200).json({
      message: 'Роли обновлены успешно',
      user,
    });
  } catch (error) {
    console.error('Ошибка обновления ролей:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Редактирование собственного профиля
export const updateProfile = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { error, value } = updateProfileSchema.validate(req.body);

    if (error) {
      res.status(400).json({ errors: error.details.map((d) => d.message) });
      return;
    }

    if (value.nickname) {
      const existing = await User.findOne({
        nickname: value.nickname,
        _id: { $ne: req.user.id },
      });

      if (existing) {
        res.status(409).json({ error: 'Этот никнейм уже занят' });
        return;
      }
    }

    const user = await User.findByIdAndUpdate(req.user.id, value, {
      new: true,
    }).select('-hashed_pwd');

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    res.status(200).json({
      message: 'Профиль обновлен успешно',
      user,
    });
  } catch (error) {
    console.error('Ошибка обновления профиля:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const getUserById = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const user = await User.findById(req.params.id)
      .select('-hashed_pwd')
      .populate('gameAppls');

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};
