import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authService } from '../services/auth';
import { SignupRequest } from '../types';

export default function Signup() {
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);

  const [formData, setFormData] = useState<SignupRequest>({
    firstName: '',
    lastName: '',
    nickname: '',
    username: '',
    city: '',
    phone: '',
    hashed_pwd: '',
  });
  const [error, setError] = useState('');
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
    setError('');

    try {
      const response = await authService.signup(formData);
      setUser(response.user, response.token);
      navigate('/games');
    } catch (err: any) {
      const message = err.response?.data?.error || 'Ошибка регистрации';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow">
      <h1 className="text-3xl font-bold mb-6 text-center">Регистрация</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          name="firstName"
          placeholder="Имя"
          value={formData.firstName}
          onChange={handleChange}
          required
          className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />

        <input
          type="text"
          name="lastName"
          placeholder="Фамилия"
          value={formData.lastName}
          onChange={handleChange}
          required
          className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />

        <input
          type="text"
          name="nickname"
          placeholder="Никнейм"
          value={formData.nickname}
          onChange={handleChange}
          required
          className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />

        <input
          type="email"
          name="username"
          placeholder="Email"
          value={formData.username}
          onChange={handleChange}
          required
          className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />

        <input
          type="text"
          name="city"
          placeholder="Город"
          value={formData.city}
          onChange={handleChange}
          required
          className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />

        <input
          type="tel"
          name="phone"
          placeholder="Телефон"
          value={formData.phone}
          onChange={handleChange}
          required
          className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />

        <input
          type="password"
          name="hashed_pwd"
          placeholder="Пароль (минимум 6 символов)"
          value={formData.hashed_pwd}
          onChange={handleChange}
          required
          minLength={6}
          className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-primary text-white py-2 rounded hover:bg-opacity-90 disabled:bg-gray-400 transition"
        >
          {isLoading ? 'Загружается...' : 'Зарегистрироваться'}
        </button>
      </form>

      <p className="mt-4 text-center text-gray-600">
        Уже есть аккаунт?{' '}
        <a href="/login" className="text-primary hover:underline">
          Войдите
        </a>
      </p>
    </div>
  );
}
