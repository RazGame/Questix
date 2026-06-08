import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authService } from '../services/auth';

export default function Login() {
  const navigate = useNavigate();
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
      navigate('/games');
    } catch (err: any) {
      const message = err.response?.data?.error || 'Ошибка входа';
      setLocalError(message);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow">
      <h1 className="text-3xl font-bold mb-6 text-center">Вход</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-gray-700 mb-2">Email</label>
          <input
            type="email"
            name="username"
            value={formData.username}
            onChange={handleChange}
            required
            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-gray-700 mb-2">Пароль</label>
          <input
            type="password"
            name="hashed_pwd"
            value={formData.hashed_pwd}
            onChange={handleChange}
            required
            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-primary text-white py-2 rounded hover:bg-opacity-90 disabled:bg-gray-400 transition"
        >
          {isLoading ? 'Загружается...' : 'Войти'}
        </button>
      </form>

      <p className="mt-4 text-center text-gray-600">
        Нет аккаунта?{' '}
        <a href="/signup" className="text-primary hover:underline">
          Зарегистрируйтесь
        </a>
      </p>
    </div>
  );
}
