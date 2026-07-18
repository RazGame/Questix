import { create } from 'zustand';
import { User } from '../types';

interface AuthStore {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  setUser: (user: User, token: string) => void;
  clearAuth: () => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
}

// Безопасное чтение пользователя из localStorage: порченый JSON не должен
// ронять инициализацию приложения — чистим и стартуем разлогиненными.
const readStoredUser = (): User | null => {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    return null;
  }
};

export const useAuthStore = create<AuthStore>((set) => ({
  user: readStoredUser(),
  token: localStorage.getItem('token'),
  isLoading: false,
  error: null,

  setUser: (user: User, token: string) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    set({ user, token, error: null });
  },

  clearAuth: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    set({ user: null, token: null });
  },

  setError: (error: string | null) => set({ error }),
  setLoading: (loading: boolean) => set({ isLoading: loading }),
}));
