import mongoose from 'mongoose';

export interface IGameTeamProgress {
  _id?: string;
  gameApplId: mongoose.Types.ObjectId; // Ссылка на GameAppl (заявка команды/игрока)
  gameId: mongoose.Types.ObjectId;
  teamId?: mongoose.Types.ObjectId | null; // ID команды (null для одиночного квеста)
  userId: mongoose.Types.ObjectId; // Капитан команды или одиночный игрок
  taskOrder: mongoose.Types.ObjectId[]; // Порядок заданий для этой команды (массив Task IDs)
  currentTaskIndex: number; // Какой сейчас задачи индекс
  completedTasks: {
    taskId: mongoose.Types.ObjectId;
    answer: string;
    isCorrect: boolean;
    submittedBy?: mongoose.Types.ObjectId; // Участник, отправивший ответ
    timeSpent: number; // Секунды
    completedAt: Date;
  }[];
  gameStartedAt: Date;
  gameFinishedAt?: Date;
  totalTime?: number; // Чистое время прохождения в секундах
  // Корректировки времени от организатора: amount > 0 - штраф, amount < 0 - бонус (секунды)
  timeAdjustments: {
    amount: number;
    reason: string;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
  }[];
  status: 'not_started' | 'in_progress' | 'completed' | 'abandoned';
  createdAt?: Date;
  updatedAt?: Date;
}

const gameTeamProgressSchema = new mongoose.Schema<IGameTeamProgress>(
  {
    gameApplId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GameAppl',
      required: true,
    },
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Game',
      required: true,
    },
    // Для одиночных квестов команды нет — прогресс привязан к userId.
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: false,
      default: null,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    taskOrder: {
      type: [mongoose.Schema.Types.ObjectId],
      required: true,
    },
    currentTaskIndex: {
      type: Number,
      default: 0,
    },
    completedTasks: [
      {
        taskId: mongoose.Schema.Types.ObjectId,
        answer: String,
        isCorrect: Boolean,
        submittedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        timeSpent: Number,
        completedAt: Date,
      },
    ],
    gameStartedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    gameFinishedAt: Date,
    totalTime: Number,
    timeAdjustments: [
      {
        amount: {
          type: Number,
          required: true,
        },
        reason: {
          type: String,
          required: true,
          trim: true,
        },
        createdBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed', 'abandoned'],
      default: 'not_started',
    },
  },
  { timestamps: true }
);

gameTeamProgressSchema.index({ gameApplId: 1 }, { unique: true });
gameTeamProgressSchema.index({ gameId: 1, status: 1 });

export const GameTeamProgress = mongoose.model<IGameTeamProgress>(
  'GameTeamProgress',
  gameTeamProgressSchema
);
