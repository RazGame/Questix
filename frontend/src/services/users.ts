import api from './api';

export interface AdminUser {
  _id: string;
  firstName: string;
  lastName: string;
  nickname: string;
  username: string;
  city: string;
  phone: string;
  roles: string[];
}

export interface UserSearchResult {
  _id: string;
  firstName: string;
  lastName: string;
  nickname: string;
  city?: string;
}

export interface ProfileUpdate {
  firstName?: string;
  lastName?: string;
  nickname?: string;
  city?: string;
  phone?: string;
}

export const userService = {
  // Все пользователи (admin)
  getAll: async (): Promise<AdminUser[]> => {
    const response = await api.get('/users');
    return response.data;
  },

  search: async (query: string): Promise<UserSearchResult[]> => {
    const response = await api.get('/users/search', { params: { q: query } });
    return response.data;
  },

  getById: async (userId: string): Promise<AdminUser> => {
    const response = await api.get(`/users/${userId}`);
    return response.data;
  },

  // Назначить роли пользователю (admin)
  updateRoles: async (userId: string, roles: string[]): Promise<AdminUser> => {
    const response = await api.patch(`/users/${userId}/roles`, { roles });
    return response.data.user;
  },

  // Обновить свой профиль
  updateProfile: async (data: ProfileUpdate): Promise<AdminUser> => {
    const response = await api.put('/users/profile', data);
    return response.data.user;
  },
};
