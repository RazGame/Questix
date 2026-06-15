import api from './api';

export interface GameStatistics {
  game: {
    id: string;
    title: string;
    description: string;
    published: boolean;
    createdBy: {
      _id: string;
      nickname: string;
    };
    organizers: Array<{
      _id: string;
      nickname: string;
    }>;
    taskOrderMode?: 'linear' | 'random' | 'manual';
    dateofstart: string;
    dateofend: string;
  };
  tasks: Array<{
    _id: string;
    title: string;
    description: string;
    orderIndex: number;
  }>;
  statistics: Array<{
    teamId: string;
    teamName: string;
    captain: {
      _id: string;
      nickname: string;
      firstName: string;
      lastName: string;
    };
    members: Array<{
      _id: string;
      nickname: string;
      firstName: string;
      lastName: string;
    }>;
    status: 'not_started' | 'in_progress' | 'completed' | 'abandoned';
    place: number | null;
    taskResults: Array<{
      taskIndex: number;
      taskId: string;
      taskTitle: string;
      taskDescription: string;
      completed: boolean;
      attempts: number;
      answer: string | null;
      isCorrect: boolean | null;
      submittedBy: {
        _id: string;
        nickname: string;
        firstName: string;
        lastName: string;
      } | null;
      timeSpent: number | null;
      completedAt: string | null;
    }>;
    totalTasks: number;
    completedTasks: number;
    baseTotalTime: number | null; // чистое время без корректировок
    timeAdjustments: Array<{
      amount: number; // секунды: > 0 штраф, < 0 бонус
      reason: string;
      createdBy?: { _id: string; nickname: string } | null;
      createdAt: string;
    }>;
    adjustmentsTotal: number;
    totalTime: number | null; // итоговое время с учётом штрафов и бонусов
    gameStartedAt: string;
    gameFinishedAt: string | null;
  }>;
  totalTeams: number;
  completedTeams: number;
}

export interface TeamLogEntry {
  _id: string;
  team: { _id: string; name: string } | null;
  user: { _id: string; nickname: string; firstName: string; lastName: string } | null;
  task: { _id: string; title: string } | null;
  action:
    | 'game_started'
    | 'task_answered'
    | 'task_correct'
    | 'task_incorrect'
    | 'task_passed'
    | 'game_finished'
    | 'game_abandoned';
  answer?: string;
  isCorrect?: boolean;
  timestamp: string;
}

export const results = {
  // Получить статистику игры
  getGameStatistics: async (gameId: string): Promise<GameStatistics> => {
    const response = await api.get(`/games/${gameId}/stats`);
    return response.data;
  },

  // Опубликовать результаты игры
  publishResults: async (gameId: string): Promise<any> => {
    const response = await api.post(`/games/${gameId}/publish`);
    return response.data;
  },

  // Получить логи команд (админ - все игры, организатор - свои)
  getGameLogs: async (gameId: string): Promise<TeamLogEntry[]> => {
    const response = await api.get(`/games/${gameId}/logs`);
    return response.data;
  },
};
