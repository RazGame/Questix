import mongoose from 'mongoose';
import { IGame } from '../types';

// Квест-поля обязательны только для обычных квестов, не для «Угадай мелодию».
function requiredForQuest(this: IGame): boolean {
  return this.kind !== 'guess_song';
}

const gameSchema = new mongoose.Schema<IGame>(
  {
    kind: {
      type: String,
      enum: ['quest', 'guess_song'],
      default: 'quest',
      index: true,
    },
    format: {
      type: String,
      enum: ['online', 'offline'],
      default: 'online',
    },
    title: {
      type: String,
      required: [true, 'Название обязательно'],
      unique: true,
      trim: true,
    },
    city: {
      type: String,
      required: [requiredForQuest, 'Город обязателен'],
    },
    dateofstart: {
      type: Date,
      required: [requiredForQuest, 'Дата начала обязательна'],
    },
    dateofend: {
      type: Date,
      required: [requiredForQuest, 'Дата окончания обязательна'],
    },
    deposit: {
      type: String,
      required: [requiredForQuest, 'Депозит обязателен'],
    },
    prize: {
      type: String,
      required: [requiredForQuest, 'Приз обязателен'],
    },
    description: {
      type: String,
      required: [requiredForQuest, 'Описание обязательно'],
    },
    published: {
      type: Boolean,
      default: false,
    },
    // --- поля игры «Угадай мелодию» ---
    code: {
      type: String,
      index: true,
    },
    blocks: [
      {
        name: { type: String, required: true },
        songIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
      },
    ],
    taskOrderMode: {
      type: String,
      enum: ['linear', 'random', 'manual'],
      default: 'linear',
    },
    gameAppls: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GameAppl',
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    organizers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  { timestamps: true }
);

gameSchema.index({ dateofstart: 1, dateofend: 1 });

export const Game = mongoose.model<IGame>('Game', gameSchema);
