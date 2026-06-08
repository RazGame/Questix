import { Router } from 'express';
import * as authController from '../controllers/auth';
import { validateRequest } from '../middleware/validation';
import Joi from 'joi';

const router = Router();

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

/**
 * @swagger
 * /auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Регистрация нового пользователя
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, nickname, username, city, phone, hashed_pwd]
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               nickname:
 *                 type: string
 *               username:
 *                 type: string
 *                 format: email
 *               city:
 *                 type: string
 *               phone:
 *                 type: string
 *               hashed_pwd:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       201:
 *         description: Пользователь создан успешно
 *       409:
 *         description: Пользователь уже существует
 */
router.post('/signup', validateRequest(signupSchema), authController.signup);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Вход в систему
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, hashed_pwd]
 *             properties:
 *               username:
 *                 type: string
 *                 format: email
 *               hashed_pwd:
 *                 type: string
 *     responses:
 *       200:
 *         description: Вход выполнен успешно
 *       401:
 *         description: Неверные учетные данные
 */
router.post('/login', validateRequest(loginSchema), authController.login);

export default router;
