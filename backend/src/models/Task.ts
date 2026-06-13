import mongoose from 'mongoose';

export interface ITask {
  _id?: string;
  gameId: mongoose.Types.ObjectId;
  title: string;
  description: string; // HTML контент задания
  answers: string[]; // массив правильных ответов (case-insensitive)
  hints?: Array<string | { text: string; delayMinutes?: number }>; // подсказки
  orderIndex: number; // порядок в квесте (может быть переопределен для каждой команды)
  timeLimit?: number; // лимит времени в секундах (опционально)
  createdAt?: Date;
  updatedAt?: Date;
}

const taskSchema = new mongoose.Schema<ITask>(
  {
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Game',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Название задания обязательно'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Описание задания обязательно'],
    },
    answers: {
      type: [String],
      required: [true, 'Ответы обязательны'],
      set: (answers: string[]) => answers.map(a => a.toLowerCase().trim()),
    },
    hints: [
      {
        text: {
          type: String,
          required: true,
        },
        delayMinutes: {
          type: Number,
          default: 0,
        },
      },
    ],
    orderIndex: {
      type: Number,
      required: true,
      default: 0,
    },
    timeLimit: {
      type: Number,
      default: null, // null = без лимита
    },
  },
  { timestamps: true }
);

taskSchema.index({ gameId: 1, orderIndex: 1 });

export const Task = mongoose.model<ITask>('Task', taskSchema);
