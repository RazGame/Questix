import mongoose from 'mongoose';
import { ITeam } from '../types';

const teamSchema = new mongoose.Schema<ITeam>(
  {
    name: {
      type: String,
      required: [true, 'Название команды обязательно'],
      trim: true,
    },
    captain: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Капитан команды обязателен'],
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    gameAppl: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GameAppl',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Индекс на капитана для поиска команд по капитану
teamSchema.index({ captain: 1 });

export const Team = mongoose.model<ITeam>('Team', teamSchema);
