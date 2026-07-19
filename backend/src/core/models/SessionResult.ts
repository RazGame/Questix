import mongoose from 'mongoose';
import { ISessionResult } from '../types';

// Итог сыгранной вечеринки (ROADMAP этап 5). Одна и та же модель живёт
// и на станции (снапшот при finished, поле sentAt), и в облаке (принятые
// результаты, поле receivedAt). Идемпотентность — уникальный resultId.
const standingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    teamName: { type: String, default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    score: { type: Number, default: 0 },
    place: { type: Number, required: true },
  },
  { _id: false }
);

const sessionResultSchema = new mongoose.Schema<ISessionResult>(
  {
    resultId: { type: String, required: true, unique: true },
    gameId: { type: String, required: true },
    kind: { type: String, required: true, default: 'guess_song' },
    title: { type: String, required: true },
    mode: { type: String, enum: ['solo', 'team'], default: 'solo' },
    finishedAt: { type: Date, required: true },
    standings: { type: [standingSchema], default: [] },
    sentAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Профиль пользователя ищет свои вечеринки по standings.userId
sessionResultSchema.index({ 'standings.userId': 1, finishedAt: -1 });

export const SessionResult = mongoose.model<ISessionResult>('SessionResult', sessionResultSchema);
