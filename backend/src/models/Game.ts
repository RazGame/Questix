import mongoose from 'mongoose';
import { IGame } from '../types';

const gameSchema = new mongoose.Schema<IGame>(
  {
    title: {
      type: String,
      required: [true, 'Название квеста обязательно'],
      unique: true,
      trim: true,
    },
    city: {
      type: String,
      required: [true, 'Город обязателен'],
    },
    dateofstart: {
      type: Date,
      required: [true, 'Дата начала обязательна'],
    },
    dateofend: {
      type: Date,
      required: [true, 'Дата окончания обязательна'],
    },
    deposit: {
      type: String,
      required: [true, 'Депозит обязателен'],
    },
    prize: {
      type: String,
      required: [true, 'Приз обязателен'],
    },
    description: {
      type: String,
      required: [true, 'Описание обязательно'],
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
  },
  { timestamps: true }
);

gameSchema.index({ dateofstart: 1, dateofend: 1 });

export const Game = mongoose.model<IGame>('Game', gameSchema);
