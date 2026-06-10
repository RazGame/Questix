import mongoose from 'mongoose';

export interface IGameTeamProgress {
  _id?: string;
  gameApplId: mongoose.Types.ObjectId; // Ссылка на GameAppl (заявка команды)
  gameId: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId; // ID команды (Team)
  userId: mongoose.Types.ObjectId; // Капитан команды (кто подал заявку)
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
  totalTime?: number; // В секундах
  totalPoints: number;
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
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
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
    totalPoints: {
      type: Number,
      default: 0,
    },
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
