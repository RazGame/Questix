import api from './api';
import { GameAppl } from '../types';

export const applService = {
  // Заявка подаётся капитаном от имени его команды
  createAppl: async (data: { gameId: string }): Promise<GameAppl> => {
    const response = await api.post('/appls', data);
    return response.data.appl;
  },

  getMyAppls: async (): Promise<GameAppl[]> => {
    const response = await api.get('/appls/my');
    return response.data;
  },

  updateApplStatus: async (id: string, status: string): Promise<GameAppl> => {
    const response = await api.patch(`/appls/${id}/status`, { status });
    return response.data.appl;
  },

  getGameAppls: async (gameId: string): Promise<GameAppl[]> => {
    const response = await api.get(`/appls/game/${gameId}`);
    return response.data;
  },

  // Настройки команды на игру: время старта (линейный режим) и ручной порядок заданий
  updateApplSettings: async (
    applId: string,
    settings: { startAt?: string | null; taskOrder?: string[] }
  ): Promise<GameAppl> => {
    const response = await api.patch(`/appls/${applId}/settings`, settings);
    return response.data.appl;
  },
};
