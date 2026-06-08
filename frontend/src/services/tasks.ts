import api from './api';
import { Task } from '../types';

export const taskService = {
  getGameTasks: async (gameId: string): Promise<Task[]> => {
    const response = await api.get(`/tasks/game/${gameId}`);
    return response.data;
  },

  getTaskById: async (taskId: string): Promise<Task> => {
    const response = await api.get(`/tasks/${taskId}`);
    return response.data;
  },

  createTask: async (gameId: string, data: Omit<Task, '_id'>): Promise<Task> => {
    const response = await api.post(`/tasks/game/${gameId}`, data);
    return response.data.task;
  },

  updateTask: async (taskId: string, data: Partial<Task>): Promise<Task> => {
    const response = await api.put(`/tasks/${taskId}`, data);
    return response.data.task;
  },

  deleteTask: async (taskId: string): Promise<void> => {
    await api.delete(`/tasks/${taskId}`);
  },

  reorderTasks: async (gameId: string, taskIds: string[]): Promise<void> => {
    await api.post(`/tasks/game/${gameId}/reorder`, { taskIds });
  },
};
