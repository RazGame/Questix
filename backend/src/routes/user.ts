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

router.get('/search', authMiddleware, userController.searchUsers);

/**
 * @swagger
 * /users/profile:
 *   put:
 *     tags: [Users]
 *     summary: Обновить свой профиль
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               nickname:
 *                 type: string
 *               city:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Профиль обновлен
 */
router.put('/profile', authMiddleware, userController.updateProfile);

/**
 * @swagger
 * /users/{id}/roles:
 *   patch:
 *     tags: [Users]
 *     summary: Назначить роли пользователю (только admin)
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
 *             required: [roles]
 *             properties:
 *               roles:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [user, admin, organizer, team_captain]
 *     responses:
 *       200:
 *         description: Роли обновлены
 */
router.patch('/:id/roles', authMiddleware, adminMiddleware, userController.updateUserRoles);

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
