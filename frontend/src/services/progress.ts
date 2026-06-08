import api from './api';
import { GameTeamProgress, CurrentTaskResponse } from '../types';

export const progressService = {
  startGame: async (gameApplId: string): Promise<GameTeamProgress> => {
    const response = await api.post('/progress/start', { gameApplId });
    return response.data.progress;
  },

  getCurrentTask: async (gameApplId: string): Promise<CurrentTaskResponse> => {
    const response = await api.get(`/progress/${gameApplId}/current-task`);
    return response.data;
  },

  submitAnswer: async (gameApplId: string, answer: string): Promise<any> => {
    const response = await api.post(`/progress/${gameApplId}/submit-answer`, { answer });
    return response.data;
  },

  getProgress: async (gameApplId: string): Promise<GameTeamProgress> => {
    const response = await api.get(`/progress/${gameApplId}`);
    return response.data;
  },

  setTeamTaskOrder: async (gameApplId: string, taskIds: string[]): Promise<void> => {
    await api.post(`/progress/${gameApplId}/set-order`, { taskIds });
  },

  getGameResults: async (gameId: string): Promise<GameTeamProgress[]> => {
    const response = await api.get(`/progress/game/${gameId}/results`);
    return response.data;
  },
};
