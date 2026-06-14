import { Types } from 'mongoose';

export interface IUser {
  _id?: string;
  firstName: string;
  lastName: string;
  nickname: string;
  username: string; // email
  city: string;
  phone: string;
  password?: string;
  hashed_pwd: string;
  roles: string[];
  gameAppls: string[]; // IDs квестовых заявок
  createdAt?: Date;
  updatedAt?: Date;
}

// Порядок прохождения заданий:
// linear - общий порядок для всех команд (возможен старт команд по расписанию);
// random - каждой команде случайный порядок при старте;
// manual - порядок задаётся организатором для каждой команды отдельно.
export type TaskOrderMode = 'linear' | 'random' | 'manual';

// Вид игры: квест (как раньше) или «Угадай мелодию».
export type GameKind = 'quest' | 'guess_song';
// Формат проведения. Угадайка пока только offline.
export type GameFormat = 'online' | 'offline';

// Блок песен в игре «Угадай мелодию» (тематическая группа).
export interface IMusicBlock {
  _id?: Types.ObjectId;
  name: string;
  songIds: Types.ObjectId[];
}

export interface IGame {
  _id?: string;
  kind: GameKind;
  format: GameFormat;
  title: string;
  city: string;
  dateofstart: Date;
  dateofend: Date;
  deposit: string;
  prize: string;
  description: string;
  published?: boolean; // Опубликованы ли результаты игры
  taskOrderMode?: TaskOrderMode;
  gameAppls: string[]; // IDs заявок
  createdBy?: string; // ID создателя игры (организатор/админ)
  organizers?: Types.ObjectId[]; // Соорганизаторы: могут править игру наравне с создателем
  // Поля игры «Угадай мелодию»
  code?: string; // короткий код входа для игроков
  blocks?: IMusicBlock[]; // блоки песен
  createdAt?: Date;
  updatedAt?: Date;
}

// Песня в игре «Угадай мелодию».
export interface ISong {
  _id?: string;
  gameId: Types.ObjectId;
  title: string;
  artist: string;
  album: string;
  cover: string;
  duration: number;
  startSec: number; // таймкод старта воспроизведения
  endSec?: number | null; // таймкод конца отрезка (null = до конца трека)
  sourceUrl: string; // ссылка-источник для авто-загрузки
  preview: string;
  file: string | null; // относительный путь в /media, когда скачано
  status: 'pending' | 'downloading' | 'ready' | 'error';
  error: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IGameAppl {
  _id?: string;
  userId: Types.ObjectId;
  gameId: Types.ObjectId;
  team?: Types.ObjectId; // Ссылка на Team
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  teamName?: string;
  teamMembers?: string[];
  startAt?: Date | null; // Индивидуальное время старта команды (линейный режим)
  taskOrder?: Types.ObjectId[]; // Ручной порядок заданий для этой команды (manual режим)
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITeam {
  _id?: string;
  name: string;
  captain: Types.ObjectId; // ID капитана (User)
  members: Types.ObjectId[]; // IDs участников (Users)
  gameAppl?: Types.ObjectId; // Ссылка на GameAppl (заявка команды)
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITaskHint {
  text: string;
  delayMinutes?: number;
}

export interface ITeamLog {
  _id?: string;
  team: Types.ObjectId; // ID Team
  gameAppl: Types.ObjectId; // ID GameAppl
  game: Types.ObjectId; // ID Game
  user: Types.ObjectId; // ID пользователя, совершившего действие
  task: Types.ObjectId; // ID Task
  action: 'game_started' | 'task_answered' | 'task_correct' | 'task_incorrect' | 'task_passed' | 'game_finished' | 'game_abandoned';
  answer?: string; // Отправленный ответ
  isCorrect?: boolean; // Правильный ли ответ
  timestamp: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface JWTPayload {
  id: string;
  username: string;
  roles: string[];
}
