import { Router } from 'express';
import * as gameController from '../controllers/game';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * /games:
 *   get:
 *     tags: [Games]
 *     summary: Получить все квесты
 *     responses:
 *       200:
 *         description: Список всех квестов
 */
router.get('/', gameController.getAllGames);

/**
 * @swagger
 * /games/{id}:
 *   get:
 *     tags: [Games]
 *     summary: Получить квест по ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Квест найден
 *       404:
 *         description: Квест не найден
 */
router.get('/:id', gameController.getGameById);

/**
 * @swagger
 * /games:
 *   post:
 *     tags: [Games]
 *     summary: Создать новый квест (только admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, city, dateofstart, dateofend, deposit, prize, description]
 *             properties:
 *               title:
 *                 type: string
 *               city:
 *                 type: string
 *               dateofstart:
 *                 type: string
 *                 format: date-time
 *               dateofend:
 *                 type: string
 *                 format: date-time
 *               deposit:
 *                 type: string
 *               prize:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Квест создан успешно
 */
router.post(
  '/',
  authMiddleware,
  adminMiddleware,
  gameController.createGame
);

/**
 * @swagger
 * /games/{id}:
 *   put:
 *     tags: [Games]
 *     summary: Обновить квест (только admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               city:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Квест обновлен успешно
 */
router.put(
  '/:id',
  authMiddleware,
  adminMiddleware,
  gameController.updateGame
);

/**
 * @swagger
 * /games/{id}:
 *   delete:
 *     tags: [Games]
 *     summary: Удалить квест (только admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Квест удален успешно
 */
router.delete(
  '/:id',
  authMiddleware,
  adminMiddleware,
  gameController.deleteGame
);

export default router;
