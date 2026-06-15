import { Router } from 'express';
import * as gameController from '../controllers/game';
import { authMiddleware, adminMiddleware, organizerMiddleware, canModerateGame } from '../middleware/auth';

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
 * /games/{id}/stats:
 *   get:
 *     tags: [Games]
 *     summary: Получить статистику игры (доступна после публикации или для организатора)
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
 *         description: Статистика игры с результатами команд
 *       403:
 *         description: Результаты не опубликованы
 *       404:
 *         description: Игра не найдена
 */
router.get(
  '/:id/stats',
  authMiddleware,
  gameController.getGameStatistics
);

/**
 * @swagger
 * /games/{id}/logs:
 *   get:
 *     tags: [Games]
 *     summary: Получить логи команд по игре (админ - все игры, организатор - свои)
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
 *         description: Логи действий команд
 *       403:
 *         description: Нет доступа
 *       404:
 *         description: Игра не найдена
 */
router.get(
  '/:id/logs',
  authMiddleware,
  canModerateGame,
  gameController.getGameLogs
);

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
  organizerMiddleware,
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
  canModerateGame,
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
  canModerateGame,
  gameController.deleteGame
);

/**
 * @swagger
 * /games/{id}/publish:
 *   post:
 *     tags: [Games]
 *     summary: Опубликовать результаты игры (организатор или администратор)
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
 *         description: Результаты опубликованы
 *       403:
 *         description: Нет доступа
 *       404:
 *         description: Игра не найдена
 */
router.post(
  '/:id/publish',
  authMiddleware,
  canModerateGame,
  gameController.publishGameResults
);

/**
 * @swagger
 * /games/{id}/organizers:
 *   post:
 *     tags: [Games]
 *     summary: Добавить соорганизатора игры по никнейму (админ или создатель)
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
 *             required: [nickname]
 *             properties:
 *               nickname:
 *                 type: string
 *     responses:
 *       200:
 *         description: Организатор добавлен
 */
router.post(
  '/:id/organizers',
  authMiddleware,
  gameController.addOrganizer
);

/**
 * @swagger
 * /games/{id}/organizers/{userId}:
 *   delete:
 *     tags: [Games]
 *     summary: Удалить соорганизатора игры (админ или создатель)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Организатор удален
 */
router.delete(
  '/:id/organizers/:userId',
  authMiddleware,
  gameController.removeOrganizer
);

export default router;
