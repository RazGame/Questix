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

export interface Game {
  _id: string;
  title: string;
  city: string;
  dateofstart: string;
  dateofend: string;
  deposit: string;
  prize: string;
  description: string;
  createdBy?: string;
  gameAppls: GameAppl[];
}

export interface GameAppl {
  _id: string;
  userId: string;
  gameId: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  teamName?: string;
  teamMembers?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Task {
  _id: string;
  gameId: string;
  title: string;
  description: string; // HTML контент
  answers: string[];
  hints?: string[];
  orderIndex: number;
  timeLimit?: number;
  points?: number;
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
  totalPoints: number;
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
    hints?: string[];
    timeLimit?: number;
    orderIndex: number;
    totalTasks: number;
  };
  message?: string;
  totalTime?: number;
  totalPoints?: number;
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
