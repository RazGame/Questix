import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/auth';
import { validateRequest } from '../middleware/validation';
import { config } from '../config/config';
import Joi from 'joi';

const router = Router();

// Защита от брутфорса пароля и перебора аккаунтов.
// Модель угроз приложения — оффлайн-LAN: лимитируем только публичные адреса,
// а локалхост и приватные сети (игроки в LAN, e2e-прогоны, docker-gateway)
// не трогаем. В dev пропускаем полностью.
const privateIp =
  /^(::1|::ffff:127\.|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd|fe80:)/i;
const skipRateLimit = (req: { ip?: string }) =>
  config.env !== 'production' || (!!req.ip && privateIp.test(req.ip));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 попыток входа на публичный IP за 15 минут
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimit,
  message: { error: 'Слишком много попыток входа. Повторите позже.' },
});
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10, // 10 регистраций на публичный IP за час
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimit,
  message: { error: 'Слишком много регистраций. Повторите позже.' },
});

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
router.post('/signup', signupLimiter, validateRequest(signupSchema), authController.signup);

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
router.post('/login', loginLimiter, validateRequest(loginSchema), authController.login);

export default router;
