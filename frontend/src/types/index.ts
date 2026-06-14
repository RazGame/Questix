export interface User {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string;
  username: string;
  city: string;
  phone: string;
  roles: string[];
  gameAppls: string[];
}

export interface GameOrganizer {
  _id: string;
  nickname: string;
  firstName?: string;
  lastName?: string;
}

// Порядок прохождения заданий:
// linear - общий порядок (+ индивидуальное время старта команд);
// random - случайный порядок для каждой команды;
// manual - порядок задаётся организатором для каждой команды.
export type TaskOrderMode = 'linear' | 'random' | 'manual';

// Вид игры: квест или «Угадай мелодию».
export type GameKind = 'quest' | 'guess_song';
// Формат проведения. Угадайка пока только offline.
export type GameFormat = 'online' | 'offline';

export interface Game {
  _id: string;
  kind?: GameKind;
  format?: GameFormat;
  title: string;
  city: string;
  dateofstart: string;
  dateofend: string;
  deposit: string;
  prize: string;
  description: string;
  published?: boolean;
  taskOrderMode?: TaskOrderMode;
  createdBy?: GameOrganizer | string; // populated-документ или ID
  organizers?: GameOrganizer[]; // соорганизаторы
  gameAppls: GameAppl[];
}

// --- Игра «Угадай мелодию» ---
export interface Song {
  _id: string;
  gameId: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  duration: number;
  startSec: number;
  endSec?: number | null;
  sourceUrl: string;
  preview: string;
  file: string | null;
  status: 'pending' | 'downloading' | 'ready' | 'error';
  error: string | null;
}

export interface MusicBlock {
  _id: string;
  name: string;
  songIds: string[];
}

export interface MusicGame {
  _id: string;
  kind: 'guess_song';
  format: 'offline';
  title: string;
  code: string;
  blocks: MusicBlock[];
  createdBy?: GameOrganizer | string;
  organizers?: GameOrganizer[];
  createdAt?: string;
  updatedAt?: string;
}

// Публичное состояние сессии (зеркало publicState() сервера).
export interface MusicPlayer {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  score: number;
  armed: boolean;
  locked: boolean;
}

export interface MusicState {
  gameId: string;
  gameName: string;
  code: string;
  phase: 'lobby' | 'playing' | 'ended' | 'buzzed' | 'reveal' | 'finished';
  total: number;
  currentIndex: number;
  buzzed: { id: string; name: string } | null;
  reveal: { title: string; artist: string; album: string; cover: string } | null;
  blockName: string;
  blockCurrentIndex?: number;
  blockTotal?: number;
  players: MusicPlayer[];
  fileUrl?: string | null;
  startSec?: number;
  endSec?: number | null;
  nextUrl?: string | null;
  screenReady?: boolean;
}

export interface GameAppl {
  _id: string;
  userId:
    | string
    | {
        _id: string;
        nickname: string;
        firstName?: string;
        lastName?: string;
        phone?: string;
      };
  gameId: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  team?: {
    _id: string;
    name: string;
    captain?: {
      _id: string;
      nickname: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
    };
    members?: Array<{
      _id: string;
      nickname: string;
      firstName?: string;
      lastName?: string;
    }>;
  };
  teamName?: string;
  teamMembers?: string[];
  startAt?: string | null; // Индивидуальное время старта команды (линейный режим)
  taskOrder?: string[]; // Ручной порядок заданий для команды (режим manual)
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskHint {
  text: string;
  delayMinutes?: number;
}

export interface Task {
  _id: string;
  gameId: string;
  title: string;
  description: string; // HTML контент
  answers: string[];
  hints?: Array<string | TaskHint>;
  orderIndex: number;
  timeLimit?: number;
}

export interface GameTeamProgress {
  _id: string;
  gameApplId: string;
  gameId: string;
  teamId: string;
  userId: string;
  taskOrder: string[];
  currentTaskIndex: number;
  completedTasks: {
    taskId: string;
    answer: string;
    isCorrect: boolean;
    timeSpent: number;
    completedAt: string;
  }[];
  gameStartedAt: string;
  gameFinishedAt?: string;
  totalTime?: number;
  // Корректировки времени: amount > 0 - штраф, amount < 0 - бонус (секунды)
  timeAdjustments?: {
    amount: number;
    reason: string;
    createdBy?: { _id: string; nickname: string } | string;
    createdAt: string;
  }[];
  status: 'not_started' | 'in_progress' | 'completed' | 'abandoned';
}

export interface CurrentTaskResponse {
  status: 'in_progress' | 'completed';
  currentTaskIndex?: number;
  totalTasks?: number;
  task?: {
    _id: string;
    title: string;
    description: string;
    hints?: Array<string | TaskHint>;
    timeLimit?: number;
    orderIndex: number;
    totalTasks: number;
    taskStartedAt?: string;
    currentTaskElapsedSeconds?: number;
  };
  message?: string;
  totalTime?: number;
}

export interface LoginRequest {
  username: string;
  hashed_pwd: string;
}

export interface SignupRequest extends LoginRequest {
  firstName: string;
  lastName: string;
  nickname: string;
  city: string;
  phone: string;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}
