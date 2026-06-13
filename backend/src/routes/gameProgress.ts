import { Router } from 'express';
import * as progressController from '../controllers/gameProgress';
import { authMiddleware, adminMiddleware, canModerateGame } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * /progress/start:
 *   post:
 *     tags: [Game Progress]
 *     summary: Начать игру (создать прогресс для команды)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [gameApplId]
 *             properties:
 *               gameApplId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Игра начата
 */
router.post('/start', authMiddleware, progressController.startGame);

/**
 * @swagger
 * /progress/{gameApplId}/current-task:
 *   get:
 *     tags: [Game Progress]
 *     summary: Получить текущее задание
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameApplId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Текущее задание
 */
router.get('/:gameApplId/current-task', authMiddleware, progressController.getCurrentTask);

/**
 * @swagger
 * /progress/{gameApplId}/submit-answer:
 *   post:
 *     tags: [Game Progress]
 *     summary: Отправить ответ на задание
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameApplId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [answer]
 *             properties:
 *               answer:
 *                 type: string
 *     responses:
 *       200:
 *         description: Ответ обработан
 */
router.post(
  '/:gameApplId/submit-answer',
  authMiddleware,
  progressController.submitAnswer
);

/**
 * @swagger
 * /progress/{gameApplId}:
 *   get:
 *     tags: [Game Progress]
 *     summary: Получить прогресс команды
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameApplId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Прогресс команды
 */
router.get('/:gameApplId', authMiddleware, progressController.getProgress);

/**
 * @swagger
 * /progress/{gameApplId}/set-order:
 *   post:
 *     tags: [Game Progress]
 *     summary: Установить порядок заданий для команды (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameApplId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [taskIds]
 *             properties:
 *               taskIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Порядок установлен
 */
router.post(
  '/:gameApplId/set-order',
  authMiddleware,
  adminMiddleware,
  progressController.setTeamTaskOrder
);

/**
 * @swagger
 * /progress/{gameApplId}/adjust-time:
 *   post:
 *     tags: [Game Progress]
 *     summary: Добавить штраф или бонус ко времени команды (админ или организатор игры)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameApplId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, reason]
 *             properties:
 *               amount:
 *                 type: integer
 *                 description: Секунды. Положительное - штраф, отрицательное - бонус
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Корректировка добавлена
 */
router.post(
  '/:gameApplId/adjust-time',
  authMiddleware,
  progressController.adjustTeamTime
);

/**
 * @swagger
 * /progress/game/{gameId}/results:
 *   get:
 *     tags: [Game Progress]
 *     summary: Получить результаты всех команд (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Результаты команд
 */
router.get(
  '/game/:gameId/results',
  authMiddleware,
  canModerateGame,
  progressController.getGameResults
);

export default router;
