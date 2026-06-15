import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authService } from '../services/auth';

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Куда вернуть после входа (напр. на страницу игрока угадайки).
  const redirect = params.get('redirect');
  const setUser = useAuthStore((state) => state.setUser);
  const setError = useAuthStore((state) => state.setError);

  const [formData, setFormData] = useState({
    username: '',
    hashed_pwd: '',
  });
  const [error, setLocalError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLocalError('');

    try {
      const response = await authService.login(formData);
      setUser(response.user, response.token);
      navigate(redirect || '/games');
    } catch (err: any) {
      const message = err.response?.data?.error || 'Ошибка входа';
      setLocalError(message);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 glass">
      <h1 className="text-3xl font-bold mb-6 text-center">Вход</h1>

      {error && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-zinc-300 mb-2">Email</label>
          <input
            type="email"
            name="username"
            value={formData.username}
            onChange={handleChange}
            required
            className="input-dark focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-zinc-300 mb-2">Пароль</label>
          <input
            type="password"
            name="hashed_pwd"
            value={formData.hashed_pwd}
            onChange={handleChange}
            required
            className="input-dark focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full btn-grad py-2 rounded disabled:opacity-50 transition"
        >
          {isLoading ? 'Загружается...' : 'Войти'}
        </button>
      </form>

      <p className="mt-4 text-center text-zinc-400">
        Нет аккаунта?{' '}
        <a href="/signup" className="text-primary hover:underline">
          Зарегистрируйтесь
        </a>
      </p>
    </div>
  );
}
