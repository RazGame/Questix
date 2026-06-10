import { useState } from 'react';
import { userService } from '../services/users';
import { useAuthStore } from '../store/authStore';

export default function Profile() {
  const { user, token, setUser } = useAuthStore();

  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    nickname: user?.nickname || '',
    city: user?.city || '',
    phone: user?.phone || '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      setIsSaving(true);
      const updated = await userService.updateProfile(formData);

      // Обновляем пользователя в сторе, сохраняя токен
      if (user && token) {
        setUser(
          {
            ...user,
            firstName: updated.firstName,
            lastName: updated.lastName,
            nickname: updated.nickname,
            city: updated.city,
            phone: updated.phone,
          },
          token
        );
      }

      setSuccess('Профиль обновлен успешно');
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.errors?.[0] ||
          'Ошибка обновления профиля'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const fields: Array<{ key: keyof typeof formData; label: string }> = [
    { key: 'firstName', label: 'Имя' },
    { key: 'lastName', label: 'Фамилия' },
    { key: 'nickname', label: 'Никнейм' },
    { key: 'city', label: 'Город' },
    { key: 'phone', label: 'Телефон' },
  ];

  return (
    <div className="max-w-md mx-auto p-4 py-12">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-6">Мой профиль</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-100 text-green-700 rounded">{success}</div>
        )}

        <p className="text-sm text-gray-600 mb-4">
          Email: <strong>{user?.username}</strong>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map(({ key, label }) => (
            <label key={key} className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
              <input
                type="text"
                value={formData[key]}
                onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
              />
            </label>
          ))}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full bg-primary text-white font-bold py-2 px-4 rounded hover:bg-opacity-90 disabled:opacity-50 transition"
          >
            {isSaving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </form>
      </div>
    </div>
  );
}
