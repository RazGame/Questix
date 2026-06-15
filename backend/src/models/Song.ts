import mongoose from 'mongoose';
import { ISong } from '../types';

// Песня в игре «Угадай мелодию». Отдельная коллекция (а не вложенная карта),
// чтобы атомарно обновлять статус загрузки одной песни в фоне.
const songSchema = new mongoose.Schema<ISong>(
  {
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Game',
      required: true,
      index: true,
    },
    title: { type: String, default: 'Без названия', trim: true },
    artist: { type: String, default: '' },
    album: { type: String, default: '' },
    cover: { type: String, default: '' },
    duration: { type: Number, default: 0 },
    startSec: { type: Number, default: 0 }, // таймкод старта воспроизведения
    endSec: { type: Number, default: null }, // таймкод конца отрезка (null = до конца)
    sourceUrl: { type: String, default: '' }, // ссылка-источник для авто-загрузки
    preview: { type: String, default: '' },
    file: { type: String, default: null }, // относительный путь в /media
    status: {
      type: String,
      enum: ['pending', 'downloading', 'ready', 'error'],
      default: 'pending',
    },
    error: { type: String, default: null },
  },
  { timestamps: true }
);

export const Song = mongoose.model<ISong>('Song', songSchema);
