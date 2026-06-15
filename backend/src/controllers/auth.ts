import { Response } from 'express';
import Joi from 'joi';
import { User } from '../models/User';
import { comparePassword } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { AuthenticatedRequest } from '../middleware/auth';

const signupSchema = Joi.object({
  firstName: Joi.string().required().trim(),
  lastName: Joi.string().required().trim(),
  nickname: Joi.string().required().trim(),
  username: Joi.string().email().required().lowercase().trim(),
  city: Joi.string().required().trim(),
  phone: Joi.string().required().trim(),
  hashed_pwd: Joi.string().min(6).required(),
});

const loginSchema = Joi.object({
  username: Joi.string().email().required(),
  hashed_pwd: Joi.string().required(),
});

export const signup = async (req: any, res: Response): Promise<void> => {
  try {
    const { error, value } = signupSchema.validate(req.body);

    if (error) {
      res.status(400).json({ errors: error.details.map((d) => d.message) });
      return;
    }

    const existingUser = await User.findOne({
      $or: [{ username: value.username }, { nickname: value.nickname }],
    });

    if (existingUser) {
      res.status(409).json({ error: 'Пользователь уже существует' });
      return;
    }

    const newUser = new User({
      ...value,
      roles: ['user'],
    });

    await newUser.save();

    const token = generateToken({
      id: newUser._id as string,
      username: newUser.username,
      roles: newUser.roles,
    });

    res.status(201).json({
      message: 'Пользователь создан успешно',
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        nickname: newUser.nickname,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        city: newUser.city,
        phone: newUser.phone,
        roles: newUser.roles,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const login = async (req: any, res: Response): Promise<void> => {
  try {
    const { error, value } = loginSchema.validate(req.body);

    if (error) {
      res.status(400).json({ errors: error.details.map((d) => d.message) });
      return;
    }

    const user = await User.findOne({ username: value.username });

    if (!user) {
      res.status(401).json({ error: 'Неверные учетные данные' });
      return;
    }

    const isPasswordValid = await comparePassword(value.hashed_pwd, user.hashed_pwd);

    if (!isPasswordValid) {
      res.status(401).json({ error: 'Неверные учетные данные' });
      return;
    }

    const token = generateToken({
      id: user._id as string,
      username: user.username,
      roles: user.roles,
    });

    res.status(200).json({
      message: 'Вход выполнен успешно',
      token,
      user: {
        id: user._id,
        username: user.username,
        nickname: user.nickname,
        firstName: user.firstName,
        lastName: user.lastName,
        city: user.city,
        phone: user.phone,
        roles: user.roles,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const getProfile = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const user = await User.findById(req.user.id).select('-hashed_pwd');

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};
