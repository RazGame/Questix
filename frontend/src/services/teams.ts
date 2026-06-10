import api from './api';

export interface ITeam {
  _id?: string;
  name: string;
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
  gameAppl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const teams = {
  // Создать новую команду
  create: async (name: string, members?: string[]): Promise<ITeam> => {
    const response = await api.post('/teams', { name, members });
    return response.data.team;
  },

  // Получить информацию о команде
  getTeam: async (teamId: string): Promise<ITeam> => {
    const response = await api.get(`/teams/${teamId}`);
    return response.data;
  },

  // Получить все команды пользователя
  getUserTeams: async (): Promise<ITeam[]> => {
    const response = await api.get('/teams/my-teams');
    return response.data;
  },

  // Добавить участника в команду по никнейму
  addMember: async (teamId: string, nickname: string): Promise<ITeam> => {
    const response = await api.post(`/teams/${teamId}/members`, { nickname });
    return response.data.team;
  },

  // Удалить участника из команды
  removeMember: async (teamId: string, memberId: string): Promise<ITeam> => {
    const response = await api.delete(`/teams/${teamId}/members/${memberId}`);
    return response.data.team;
  },

  // Выйти из команды
  leave: async (teamId: string): Promise<void> => {
    await api.post(`/teams/${teamId}/leave`);
  },

  // Передать права капитана
  transferCaptain: async (teamId: string, newCaptainId: string): Promise<ITeam> => {
    const response = await api.post(`/teams/${teamId}/transfer-captain`, { newCaptainId });
    return response.data.team;
  },
};
