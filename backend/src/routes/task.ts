import { Router } from 'express';
import * as taskController from '../controllers/task';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * /tasks/game/{gameId}:
 *   get:
 *     tags: [Tasks]
 *     summary: Получить все задания квеста
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Список заданий
 */
router.get('/game/:gameId', taskController.getGameTasks);

/**
 * @swagger
 * /tasks/{taskId}:
 *   get:
 *     tags: [Tasks]
 *     summary: Получить задание по ID
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Задание найдено
 */
router.get('/:taskId', taskController.getTaskById);

/**
 * @swagger
 * /tasks/game/{gameId}:
 *   post:
 *     tags: [Tasks]
 *     summary: Создать новое задание (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description, answers, orderIndex]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *                 description: HTML контент задания
 *               answers:
 *                 type: array
 *                 items:
 *                   type: string
 *               hints:
 *                 type: array
 *                 items:
 *                   type: string
 *               orderIndex:
 *                 type: number
 *               timeLimit:
 *                 type: number
 *                 description: Лимит времени в секундах
 *               points:
 *                 type: number
 *     responses:
 *       201:
 *         description: Задание создано
 */
router.post(
  '/game/:gameId',
  authMiddleware,
  adminMiddleware,
  taskController.createTask
);

/**
 * @swagger
 * /tasks/{taskId}:
 *   put:
 *     tags: [Tasks]
 *     summary: Обновить задание (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
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
 *               description:
 *                 type: string
 *               answers:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Задание обновлено
 */
router.put(
  '/:taskId',
  authMiddleware,
  adminMiddleware,
  taskController.updateTask
);

/**
 * @swagger
 * /tasks/{taskId}:
 *   delete:
 *     tags: [Tasks]
 *     summary: Удалить задание (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Задание удалено
 */
router.delete(
  '/:taskId',
  authMiddleware,
  adminMiddleware,
  taskController.deleteTask
);

/**
 * @swagger
 * /tasks/game/{gameId}/reorder:
 *   post:
 *     tags: [Tasks]
 *     summary: Переупорядочить задания (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
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
 *         description: Порядок обновлен
 */
router.post(
  '/game/:gameId/reorder',
  authMiddleware,
  adminMiddleware,
  taskController.reorderTasks
);

export default router;
