import { Router, Response } from 'express';
import Joi from 'joi';
import { SessionResult } from '../models/SessionResult';
import { authMiddleware, organizerMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { sendPendingResults } from '../services/resultsSync';

// Итоги вечеринок (ROADMAP этап 5).
// POST /results        — облако принимает итог от станции (организатор, апсерт по resultId)
// POST /results/send   — станция отправляет свои неотправленные в облако
// GET  /results/my     — «мои вечеринки» для профиля пользователя
const router = Router();

const standingSchema = Joi.object({
  name: Joi.string().required(),
  teamName: Joi.string().allow(null, '').optional(),
  userId: Joi.string().allow(null).optional(),
  score: Joi.number().required(),
  place: Joi.number().min(1).required(),
});

const resultSchema = Joi.object({
  resultId: Joi.string().uuid().required(),
  gameId: Joi.string().required(),
  kind: Joi.string().required(),
  title: Joi.string().required(),
  mode: Joi.string().valid('solo', 'team').required(),
  finishedAt: Joi.date().required(),
  standings: Joi.array().items(standingSchema).required(),
});

router.post(
  '/',
  authMiddleware,
  organizerMiddleware,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { error, value } = resultSchema.validate(req.body);
      if (error) {
        res.status(400).json({ errors: error.details.map((d) => d.message) });
        return;
      }

      // Идемпотентность: апсерт по resultId — повторная отправка не дублирует.
      const result = await SessionResult.findOneAndUpdate(
        { resultId: value.resultId },
        {
          $set: {
            gameId: value.gameId,
            kind: value.kind,
            title: value.title,
            mode: value.mode,
            finishedAt: value.finishedAt,
            standings: value.standings.map((s: any) => ({
              ...s,
              userId: s.userId || null,
              teamName: s.teamName || null,
            })),
            receivedAt: new Date(),
            // На принимающей стороне «отправлять» нечего.
            sentAt: new Date(),
          },
        },
        { new: true, upsert: true }
      );

      res.status(200).json({ ok: true, resultId: result.resultId });
    } catch (error) {
      console.error('Ошибка приёма итогов:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
);

router.post(
  '/send',
  authMiddleware,
  organizerMiddleware,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const token = req.headers.authorization?.split(' ')[1] || '';
      const summary = await sendPendingResults(token);
      res.status(200).json(summary);
    } catch (error) {
      console.error('Ошибка отправки итогов:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
);

router.get(
  '/my',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const results = await SessionResult.find({ 'standings.userId': req.user.id })
        .sort('-finishedAt')
        .limit(100)
        .lean();

      // Отдаём компактно: только строка самого пользователя + мета вечеринки.
      const my = results.map((r) => {
        const mine = r.standings.find((s: any) => String(s.userId) === req.user.id);
        return {
          resultId: r.resultId,
          title: r.title,
          kind: r.kind,
          mode: r.mode,
          finishedAt: r.finishedAt,
          totalParticipants: r.standings.length,
          place: mine?.place ?? null,
          score: mine?.score ?? null,
          teamName: mine?.teamName ?? null,
        };
      });

      res.status(200).json(my);
    } catch (error) {
      console.error('Ошибка загрузки моих вечеринок:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
);

export default router;
