import mongoose from 'mongoose';
import { IGameAppl } from '../types';

const gameApplSchema = new mongoose.Schema<IGameAppl>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Game',
      required: true,
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'completed'],
      default: 'pending',
    },
    teamName: {
      type: String,
      trim: true,
    },
    teamMembers: [String],
    // Индивидуальное время старта команды (линейный режим порядка заданий)
    startAt: {
      type: Date,
      default: null,
    },
    // Ручной порядок заданий для этой команды (режим manual)
    taskOrder: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task',
      },
    ],
  },
  { timestamps: true }
);

gameApplSchema.index({ userId: 1, gameId: 1 }, { unique: true });

export const GameAppl = mongoose.model<IGameAppl>('GameAppl', gameApplSchema);
