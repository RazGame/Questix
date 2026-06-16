import axios from 'axios';

const defaultApiUrl =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : 'http://localhost:5000';

const API_URL = import.meta.env.VITE_API_URL || defaultApiUrl;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Добавить токен в заголовки
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Протухший/невалидный токен: чистим сессию и уводим на логин.
// Не трогаем сам логин/регистрацию (там 401 = неверные данные) и не зацикливаем,
// если уже на /login. Срабатывает только когда токен был — т.е. сессия истекла.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url: string = error.config?.url || '';
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/signup');
    if (status === 401 && !isAuthCall && localStorage.getItem('token')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
