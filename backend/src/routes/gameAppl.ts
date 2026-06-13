import { Router } from 'express';
import * as applController from '../controllers/gameAppl';
import { authMiddleware, canModerateGame } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * /appls:
 *   post:
 *     tags: [Game Applications]
 *     summary: Подать заявку на квест
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [gameId]
 *             properties:
 *               gameId:
 *                 type: string
 *               teamName:
 *                 type: string
 *               teamMembers:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Заявка подана успешно
 */
router.post('/', authMiddleware, applController.createAppl);

/**
 * @swagger
 * /appls/my:
 *   get:
 *     tags: [Game Applications]
 *     summary: Получить мои заявки
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список заявок пользователя
 */
router.get('/my', authMiddleware, applController.getMyAppls);

/**
 * @swagger
 * /appls/{id}/status:
 *   patch:
 *     tags: [Game Applications]
 *     summary: Обновить статус заявки (только admin)
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, approved, rejected, completed]
 *     responses:
 *       200:
 *         description: Статус обновлен успешно
 */
// Права (админ или организатор-создатель игры) проверяются в контроллере,
// так как в параметрах роута ID заявки, а не игры
router.patch(
  '/:id/status',
  authMiddleware,
  applController.updateApplStatus
);

/**
 * @swagger
 * /appls/{id}/settings:
 *   patch:
 *     tags: [Game Applications]
 *     summary: Настройки команды на игру - время старта и ручной порядок заданий (админ/организатор)
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
 *               startAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               taskOrder:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Настройки сохранены
 */
router.patch(
  '/:id/settings',
  authMiddleware,
  applController.updateApplSettings
);

/**
 * @swagger
 * /appls/game/{gameId}:
 *   get:
 *     tags: [Game Applications]
 *     summary: Получить заявки на конкретный квест (только admin)
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
 *         description: Список заявок на квест
 */
router.get(
  '/game/:gameId',
  authMiddleware,
  canModerateGame,
  applController.getGameAppls
);

export default router;
