import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { gameService } from '../services/games';
import { applService } from '../services/appls';
import { progressService } from '../services/progress';
import { userService, AdminUser } from '../services/users';
import { Game, GameAppl, GameTeamProgress, GameOrganizer } from '../types';
import { Trash2, Plus, Settings } from 'lucide-react';
import { dateTimeLocalToIso } from '../utils/date';
import { useAuthStore } from '../store/authStore';

const organizerId = (value: Game['createdBy']): string | undefined =>
  typeof value === 'object' ? value?._id : value;

// Роли, которые администратор может назначать вручную.
// team_captain выдается автоматически при создании команды.
const ASSIGNABLE_ROLES: Array<{ value: string; label: string }> = [
  { value: 'admin', label: 'Администратор' },
  { value: 'organizer', label: 'Организатор' },
];

export default function AdminPanel() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [gameAppls, setGameAppls] = useState<GameAppl[]>([]);
  const [gameResults, setGameResults] = useState<GameTeamProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'appls' | 'results' | 'organizers'>('appls');
  const [mainTab, setMainTab] = useState<'games' | 'users'>('games');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [newOrganizerNickname, setNewOrganizerNickname] = useState('');

  const isAdmin = !!user?.roles?.includes('admin');

  // Организатор видит только свои игры (созданные им или где он соорганизатор)
  const canModerate = (game: Game): boolean =>
    isAdmin ||
    organizerId(game.createdBy) === user?.id ||
    (game.organizers || []).some((o) => o._id === user?.id);

  const visibleGames = games.filter(canModerate);
  const currentGame = games.find((g) => g._id === selectedGame) || null;
  const canManageOrganizers =
    !!currentGame && (isAdmin || organizerId(currentGame.createdBy) === user?.id);
  const [formData, setFormData] = useState({
    title: '',
    city: '',
    dateofstart: '',
    dateofend: '',
    deposit: '',
    prize: '',
    description: '',
  });

  useEffect(() => {
    loadGames();
  }, []);

  useEffect(() => {
    if (selectedGame) {
      loadGameAppls();
      loadGameResults();
    }
  }, [selectedGame]);

  const loadGames = async () => {
    try {
      setIsLoading(true);
      const data = await gameService.getAllGames();
      setGames(data);
    } catch (err: any) {
      setError('Ошибка загрузки квестов');
    } finally {
      setIsLoading(false);
    }
  };

  const loadGameAppls = async () => {
    try {
      const appls = await applService.getGameAppls(selectedGame!);
      setGameAppls(appls);
    } catch (err: any) {
      setError('Ошибка загрузки заявок');
    }
  };

  const loadGameResults = async () => {
    try {
      const results = await progressService.getGameResults(selectedGame!);
      setGameResults(results);
    } catch (err: any) {
      console.error('Ошибка загрузки результатов');
    }
  };

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await gameService.createGame({
        ...formData,
        dateofstart: dateTimeLocalToIso(formData.dateofstart),
        dateofend: dateTimeLocalToIso(formData.dateofend),
      } as any);
      setFormData({
        title: '',
        city: '',
        dateofstart: '',
        dateofend: '',
        deposit: '',
        prize: '',
        description: '',
      });
      setShowCreateForm(false);
      loadGames();
    } catch (err: any) {
      setError(
        err.response?.data?.errors?.[0] ||
          err.response?.data?.error ||
          'Ошибка создания квеста'
      );
    }
  };

  const handleDeleteGame = async (id: string) => {
    if (window.confirm('Вы уверены?')) {
      try {
        await gameService.deleteGame(id);
        loadGames();
        setSelectedGame(null);
      } catch (err: any) {
        setError('Ошибка удаления квеста');
      }
    }
  };

  const handleUpdateApplStatus = async (applId: string, status: string) => {
    try {
      await applService.updateApplStatus(applId, status);
      loadGameAppls();
    } catch (err: any) {
      setError('Ошибка обновления статуса');
    }
  };

  const loadUsers = async () => {
    try {
      const data = await userService.getAll();
      setUsers(data);
      setUsersLoaded(true);
    } catch (err: any) {
      setError('Ошибка загрузки пользователей');
    }
  };

  const handleOpenUsersTab = () => {
    setMainTab('users');
    if (!usersLoaded) {
      loadUsers();
    }
  };

  const handleAddOrganizer = async () => {
    if (!selectedGame || !newOrganizerNickname.trim()) {
      setError('Укажите никнейм пользователя');
      return;
    }

    try {
      const updated = await gameService.addOrganizer(selectedGame, newOrganizerNickname.trim());
      setGames((prev) => prev.map((g) => (g._id === updated._id ? { ...g, ...updated } : g)));
      setNewOrganizerNickname('');
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка добавления организатора');
    }
  };

  const handleRemoveOrganizer = async (userId: string) => {
    if (!selectedGame) return;

    if (window.confirm('Убрать этого организатора из игры?')) {
      try {
        const updated = await gameService.removeOrganizer(selectedGame, userId);
        setGames((prev) => prev.map((g) => (g._id === updated._id ? { ...g, ...updated } : g)));
        setError('');
      } catch (err: any) {
        setError(err.response?.data?.error || 'Ошибка удаления организатора');
      }
    }
  };

  const handleToggleRole = async (target: AdminUser, role: string) => {
    const hasRole = target.roles.includes(role);
    const newRoles = hasRole
      ? target.roles.filter((r) => r !== role)
      : [...target.roles, role];

    // Базовая роль user должна оставаться всегда
    if (!newRoles.includes('user')) {
      newRoles.push('user');
    }

    try {
      const updated = await userService.updateRoles(target._id, newRoles);
      setUsers((prev) => prev.map((u) => (u._id === updated._id ? updated : u)));
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка обновления ролей');
    }
  };

  if (isLoading) {
    return <div className="text-center py-10">Загружается...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-4">
      <h1 className="text-4xl font-bold mb-8">{isAdmin ? 'Админ панель' : 'Мои игры'}</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      {isAdmin && (
        <div className="flex gap-2 mb-6 border-b">
          <button
            onClick={() => setMainTab('games')}
            className={`px-4 py-2 font-bold border-b-2 ${
              mainTab === 'games'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Квесты
          </button>
          <button
            onClick={handleOpenUsersTab}
            className={`px-4 py-2 font-bold border-b-2 ${
              mainTab === 'users'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Пользователи
          </button>
        </div>
      )}

      {mainTab === 'users' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {!usersLoaded ? (
            <div className="p-6 text-center text-gray-600">Загрузка пользователей...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Пользователь</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Город</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Роли</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Назначить</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.map((u) => (
                    <tr key={u._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-bold text-gray-900">@{u.nickname}</div>
                        <div className="text-gray-600">
                          {u.firstName} {u.lastName}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">{u.username}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">{u.city}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((role) => (
                            <span
                              key={role}
                              className={`inline-block px-2 py-0.5 text-xs rounded-full font-semibold ${
                                role === 'admin'
                                  ? 'bg-red-100 text-red-800'
                                  : role === 'organizer'
                                  ? 'bg-purple-100 text-purple-800'
                                  : role === 'team_captain'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {role}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex gap-3">
                          {ASSIGNABLE_ROLES.map(({ value, label }) => (
                            <label key={value} className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={u.roles.includes(value)}
                                onChange={() => handleToggleRole(u, value)}
                              />
                              <span className="text-xs text-gray-700">{label}</span>
                            </label>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className={`grid md:grid-cols-3 gap-6 ${mainTab !== 'games' ? 'hidden' : ''}`}>
        {/* Games List */}
        <div className="col-span-1">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Квесты</h2>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="bg-primary text-white p-2 rounded hover:bg-opacity-90 transition"
            >
              <Plus size={20} />
            </button>
          </div>

          {showCreateForm && (
            <form onSubmit={handleCreateGame} className="bg-white p-4 rounded mb-4 space-y-3">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">Название квеста</span>
                <input
                  type="text"
                  placeholder="Например, Ночной дозор"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  required
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">Город</span>
                <input
                  type="text"
                  placeholder="Санкт-Петербург"
                  value={formData.city}
                  onChange={(e) =>
                    setFormData({ ...formData, city: e.target.value })
                  }
                  required
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </label>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-semibold text-gray-600 mb-1">Дата и время начала</span>
                  <input
                    type="datetime-local"
                    value={formData.dateofstart}
                    onChange={(e) =>
                      setFormData({ ...formData, dateofstart: e.target.value })
                    }
                    required
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-gray-600 mb-1">Дата и время окончания</span>
                  <input
                    type="datetime-local"
                    value={formData.dateofend}
                    onChange={(e) =>
                      setFormData({ ...formData, dateofend: e.target.value })
                    }
                    required
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <p className="text-xs text-gray-500">
                Окончание должно быть позже начала. Время указывается в вашем часовом поясе.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-semibold text-gray-600 mb-1">Депозит</span>
                  <input
                    type="text"
                    placeholder="0"
                    value={formData.deposit}
                    onChange={(e) =>
                      setFormData({ ...formData, deposit: e.target.value })
                    }
                    required
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-gray-600 mb-1">Приз</span>
                  <input
                    type="text"
                    placeholder="100"
                    value={formData.prize}
                    onChange={(e) =>
                      setFormData({ ...formData, prize: e.target.value })
                    }
                    required
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">Описание</span>
                <textarea
                  placeholder="Краткое описание квеста"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  required
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </label>
              <button
                type="submit"
                className="w-full bg-green-600 text-white py-1 rounded text-sm"
              >
                Создать
              </button>
            </form>
          )}

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {visibleGames.map((game) => (
              <div
                key={game._id}
                className={`p-3 rounded cursor-pointer transition ${
                  selectedGame === game._id
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
                onClick={() => setSelectedGame(game._id)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-bold">{game.title}</p>
                    <p className="text-sm opacity-75">{game.city}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/admin/game/${game._id}/tasks`);
                      }}
                      className="text-blue-600 hover:text-blue-800 p-1"
                      title="Управление заданиями"
                    >
                      <Settings size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteGame(game._id);
                      }}
                      className="text-red-600 hover:text-red-800 p-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Panel */}
        <div className="col-span-2">
          {selectedGame ? (
            <div>
              <div className="flex gap-2 mb-4 border-b">
                <button
                  onClick={() => setActiveTab('appls')}
                  className={`px-4 py-2 font-bold border-b-2 ${
                    activeTab === 'appls'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Заявки ({gameAppls.length})
                </button>
                <button
                  onClick={() => setActiveTab('results')}
                  className={`px-4 py-2 font-bold border-b-2 ${
                    activeTab === 'results'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Результаты ({gameResults.length})
                </button>
                <button
                  onClick={() => setActiveTab('organizers')}
                  className={`px-4 py-2 font-bold border-b-2 ${
                    activeTab === 'organizers'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Организаторы ({1 + (currentGame?.organizers?.length || 0)})
                </button>
              </div>

              {/* Заявки Tab */}
              {activeTab === 'appls' && (
                <div>
                  {gameAppls.length === 0 ? (
                    <p className="text-gray-600">Заявок нет</p>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {gameAppls.map((appl) => (
                        <div key={appl._id} className="bg-white p-4 rounded shadow">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="font-bold">
                                {(appl as any).userId?.nickname}
                              </p>
                              <p className="text-sm text-gray-600">
                                {(appl as any).userId?.firstName}{' '}
                                {(appl as any).userId?.lastName}
                              </p>
                              <p className="text-sm text-gray-600">
                                {(appl as any).userId?.phone}
                              </p>
                            </div>
                            <div>
                              <select
                                value={appl.status}
                                onChange={(e) =>
                                  handleUpdateApplStatus(appl._id, e.target.value)
                                }
                                className="w-full border rounded px-2 py-1"
                              >
                                <option value="pending">На рассмотрении</option>
                                <option value="approved">Одобрено</option>
                                <option value="rejected">Отклонено</option>
                                <option value="completed">Завершено</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Организаторы Tab */}
              {activeTab === 'organizers' && currentGame && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Организаторы могут править игру, задания, модерировать заявки,
                    смотреть логи и публиковать результаты.
                  </p>

                  <div className="bg-white p-4 rounded shadow flex justify-between items-center">
                    <div>
                      <p className="font-bold">
                        @{typeof currentGame.createdBy === 'object'
                          ? currentGame.createdBy?.nickname
                          : '-'}
                      </p>
                      <p className="text-sm text-gray-600">Создатель игры</p>
                    </div>
                    <span className="inline-block bg-yellow-100 text-yellow-800 text-xs px-3 py-1 rounded-full font-semibold">
                      Создатель
                    </span>
                  </div>

                  {(currentGame.organizers || []).map((org: GameOrganizer) => (
                    <div
                      key={org._id}
                      className="bg-white p-4 rounded shadow flex justify-between items-center"
                    >
                      <div>
                        <p className="font-bold">@{org.nickname}</p>
                        <p className="text-sm text-gray-600">
                          {org.firstName} {org.lastName}
                        </p>
                      </div>
                      {canManageOrganizers && (
                        <button
                          onClick={() => handleRemoveOrganizer(org._id)}
                          className="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded text-sm"
                        >
                          Убрать
                        </button>
                      )}
                    </div>
                  ))}

                  {canManageOrganizers ? (
                    <div className="bg-white p-4 rounded shadow">
                      <p className="font-bold mb-2">Добавить организатора</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Никнейм пользователя"
                          value={newOrganizerNickname}
                          onChange={(e) => setNewOrganizerNickname(e.target.value)}
                          className="flex-1 border rounded px-3 py-2 text-sm"
                        />
                        <button
                          onClick={handleAddOrganizer}
                          className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded text-sm"
                        >
                          Добавить
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      Изменять список организаторов может администратор или создатель игры.
                    </p>
                  )}
                </div>
              )}

              {/* Результаты Tab */}
              {activeTab === 'results' && (
                <div>
                  {gameResults.length === 0 ? (
                    <p className="text-gray-600">Результатов еще нет</p>
                  ) : (
                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left">Команда</th>
                            <th className="px-4 py-2 text-left">Капитан</th>
                            <th className="px-4 py-2 text-center">Очки</th>
                            <th className="px-4 py-2 text-center">Время</th>
                            <th className="px-4 py-2 text-left">Статус</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gameResults.map((result, idx) => (
                            <tr key={result._id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-4 py-2">#{idx + 1}</td>
                              <td className="px-4 py-2">
                                {(result as any).userId?.nickname}
                              </td>
                              <td className="px-4 py-2 text-center font-bold">
                                {result.totalPoints}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {result.totalTime
                                  ? `${Math.floor(result.totalTime / 60)}:${(result.totalTime % 60)
                                      .toString()
                                      .padStart(2, '0')}`
                                  : '-'}
                              </td>
                              <td className="px-4 py-2">{result.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-600 text-center">Выберите квест</p>
          )}
        </div>
      </div>
    </div>
  );
}
