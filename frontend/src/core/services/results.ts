import api from './api';

// Итоги вечеринок (ROADMAP этап 5).

export interface MyPartyResult {
  resultId: string;
  title: string;
  kind: string;
  mode: 'solo' | 'team';
  finishedAt: string;
  totalParticipants: number;
  place: number | null;
  score: number | null;
  teamName: string | null;
}

export interface SendResultsSummary {
  sent: number;
  failed: number;
  pending: number;
}

export const partyResultsService = {
  // Станция → облако: отправить все неотправленные итоги
  send: async (): Promise<SendResultsSummary> => {
    const res = await api.post('/results/send');
    return res.data;
  },
  // Профиль: мои сыгранные вечеринки
  my: async (): Promise<MyPartyResult[]> => {
    const res = await api.get('/results/my');
    return res.data;
  },
};
