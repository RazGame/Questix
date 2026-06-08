import { User } from '../models/User';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';

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
