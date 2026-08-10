import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  createTeam,
  updateTeam,
  deleteTeam,
  addMember,
  removeMember,
  leaveTeam,
  transferCaptain,
  getTeam,
  getTeamByUser,
  getUserTeams,
} from '../controllers/team';

const router = Router();

// Требуется аутентификация для всех маршрутов
router.use(authMiddleware);

// Создание новой команды: любой пользователь может создать команду
// и автоматически становится её капитаном (роль team_captain выдаётся в контроллере)
router.post('/', createTeam);

// Получить все команды текущего пользователя
router.get('/my-teams', getUserTeams);

// Получить команду конкретного пользователя
router.get('/user/:userId', getTeamByUser);

// Получить информацию о конкретной команде
router.get('/:teamId', getTeam);

// Обновить команду (требуется быть капитаном)
router.put('/:teamId', updateTeam);

// Удалить команду (требуется быть капитаном)
router.delete('/:teamId', deleteTeam);

// Добавить участника в команду (требуется быть капитаном)
router.post('/:teamId/members', addMember);

// Удалить участника из команды (требуется быть капитаном)
router.delete('/:teamId/members/:memberId', removeMember);

// Выйти из команды (любой участник, кроме капитана)
router.post('/:teamId/leave', leaveTeam);

// Передать права капитана (требуется быть капитаном)
router.post('/:teamId/transfer-captain', transferCaptain);

export default router;
