import { Router } from 'express';
import * as userController from '../controllers/user';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: Получить всех пользователей (только admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список всех пользователей
 */
router.get('/', authMiddleware, adminMiddleware, userController.getAllUsers);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Получить пользователя по ID
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
 *         description: Пользователь найден
 */
router.get('/:id', authMiddleware, userController.getUserById);

export default router;
