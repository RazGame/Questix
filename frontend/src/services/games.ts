import api from './api';
import { Game } from '../types';

export const gameService = {
  getAllGames: async (): Promise<Game[]> => {
    const response = await api.get('/games');
    return response.data;
  },

  getGameById: async (id: string): Promise<Game> => {
    const response = await api.get(`/games/${id}`);
    return response.data;
  },

  createGame: async (data: Omit<Game, '_id'>): Promise<Game> => {
    const response = await api.post('/games', data);
    return response.data.game;
  },

  updateGame: async (id: string, data: Partial<Game>): Promise<Game> => {
    const response = await api.put(`/games/${id}`, data);
    return response.data.game;
  },

  deleteGame: async (id: string): Promise<void> => {
    await api.delete(`/games/${id}`);
  },

  // Добавить соорганизатора по никнейму (админ или создатель игры)
  addOrganizer: async (gameId: string, nickname: string): Promise<Game> => {
    const response = await api.post(`/games/${gameId}/organizers`, { nickname });
    return response.data.game;
  },

  // Удалить соорганизатора (админ или создатель игры)
  removeOrganizer: async (gameId: string, userId: string): Promise<Game> => {
    const response = await api.delete(`/games/${gameId}/organizers/${userId}`);
    return response.data.game;
  },
};
