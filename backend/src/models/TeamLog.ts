import mongoose from 'mongoose';
import { ITeamLog } from '../types';

const teamLogSchema = new mongoose.Schema<ITeamLog>(
  {
    // Нет для одиночных квестов (лог привязан к user + gameAppl).
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: false,
      default: null,
    },
    gameAppl: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GameAppl',
      required: true,
    },
    game: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Game',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
    },
    action: {
      type: String,
      enum: [
        'game_started',
        'task_answered',
        'task_correct',
        'task_incorrect',
        'task_passed',
        'game_finished',
        'game_abandoned',
      ],
      required: true,
    },
    answer: {
      type: String,
    },
    isCorrect: {
      type: Boolean,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Индексы для быстрого поиска
teamLogSchema.index({ team: 1, gameAppl: 1 });
teamLogSchema.index({ game: 1, action: 1 });
teamLogSchema.index({ timestamp: -1 });

export const TeamLog = mongoose.model<ITeamLog>('TeamLog', teamLogSchema);
