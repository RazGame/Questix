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
};
