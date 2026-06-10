import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { gameService } from '../services/games';
import { applService } from '../services/appls';
import { progressService } from '../services/progress';
import { userService, AdminUser } from '../services/users';
import { Game, GameAppl, GameTeamProgress, GameOrganizer } from '../types';
import { Plus, Save, Settings, Trash2, UserPlus, X } from 'lucide-react';
import { dateTimeLocalToIso } from '../utils/date';
import { useAuthStore } from '../store/authStore';
import RichTextEditor from '../components/RichTextEditor';
import UserSearchInput from '../components/UserSearchInput';

const organizerId = (value: Game['createdBy']): string | undefined =>
  typeof value === 'object' ? value?._id : value;

// Роли, которые администратор может назначать вручную.
// team_captain выдается автоматически при создании команды.
const ASSIGNABLE_ROLES: Array<{ value: string; label: string }> = [
  { value: 'admin', label: 'Администратор' },
  { value: 'organizer', label: 'Организатор' },
];

const APPL_STATUSES: Array<{ value: GameAppl['status']; label: string }> = [
  { value: 'pending', label: 'На рассмотрении' },
  { value: 'approved', label: 'Одобрено' },
  { value: 'rejected', label: 'Отклонено' },
  { value: 'completed', label: 'Завершено' },
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
  const [draftOrganizerNickname, setDraftOrganizerNickname] = useState('');
  const [draftOrganizerNicknames, setDraftOrganizerNicknames] = useState<string[]>([]);

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

  const resetCreateForm = () => {
    setFormData({
      title: '',
      city: '',
      dateofstart: '',
      dateofend: '',
      deposit: '',
      prize: '',
      description: '',
    });
    setDraftOrganizerNickname('');
    setDraftOrganizerNicknames([]);
  };

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
        organizerNicknames: draftOrganizerNicknames,
      });
      resetCreateForm();
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

  const handleAddDraftOrganizer = () => {
    const nickname = draftOrganizerNickname.trim();
    if (!nickname) return;

    if (!draftOrganizerNicknames.includes(nickname)) {
      setDraftOrganizerNicknames((prev) => [...prev, nickname]);
    }
    setDraftOrganizerNickname('');
  };

  const handleRemoveDraftOrganizer = (nickname: string) => {
    setDraftOrganizerNicknames((prev) => prev.filter((item) => item !== nickname));
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
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded">
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
                : 'border-transparent text-zinc-400 hover:text-zinc-100'
            }`}
          >
            Квесты
          </button>
          <button
            onClick={handleOpenUsersTab}
            className={`px-4 py-2 font-bold border-b-2 ${
              mainTab === 'users'
                ? 'border-primary text-primary'
                : 'border-transparent text-zinc-400 hover:text-zinc-100'
            }`}
          >
            Пользователи
          </button>
        </div>
      )}

      {mainTab === 'users' && (
        <div className="glass overflow-hidden">
          {!usersLoaded ? (
            <div className="p-6 text-center text-zinc-400">Загрузка пользователей...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-300 uppercase">Пользователь</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-300 uppercase">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-300 uppercase">Город</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-300 uppercase">Роли</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-300 uppercase">Назначить</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {users.map((u) => (
                    <tr key={u._id} className="hover:bg-white/5">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-bold text-zinc-100">@{u.nickname}</div>
                        <div className="text-zinc-400">
                          {u.firstName} {u.lastName}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-zinc-400">{u.username}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-zinc-400">{u.city}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((role) => (
                            <span
                              key={role}
                              className={`inline-block px-2 py-0.5 text-xs rounded-full font-semibold ${
                                role === 'admin'
                                  ? 'bg-rose-400/10 text-rose-300'
                                  : role === 'organizer'
                                  ? 'bg-violet-400/10 text-violet-300'
                                  : role === 'team_captain'
                                  ? 'bg-amber-400/10 text-amber-300'
                                  : 'bg-white/10 text-zinc-300'
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
                              <span className="text-xs text-zinc-300">{label}</span>
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

      {mainTab === 'games' && showCreateForm && (
        <form onSubmit={handleCreateGame} className="glass mb-6 p-5">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Новый квест</h2>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  resetCreateForm();
                  setShowCreateForm(false);
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-zinc-200 transition hover:bg-white/10"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="btn-grad flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold"
              >
                <Save size={17} />
                Создать
              </button>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(20rem,25rem)_1fr]">
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-zinc-400">Название квеста</span>
                <input
                  type="text"
                  placeholder="Например, Ночной дозор"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  className="input-dark text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-zinc-400">Город</span>
                <input
                  type="text"
                  placeholder="Санкт-Петербург"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  required
                  className="input-dark text-sm"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-zinc-400">Дата и время начала</span>
                  <input
                    type="datetime-local"
                    value={formData.dateofstart}
                    onChange={(e) => setFormData({ ...formData, dateofstart: e.target.value })}
                    required
                    className="input-dark text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-zinc-400">Дата и время окончания</span>
                  <input
                    type="datetime-local"
                    value={formData.dateofend}
                    onChange={(e) => setFormData({ ...formData, dateofend: e.target.value })}
                    required
                    className="input-dark text-sm"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-zinc-400">Депозит</span>
                  <input
                    type="text"
                    placeholder="0"
                    value={formData.deposit}
                    onChange={(e) => setFormData({ ...formData, deposit: e.target.value })}
                    required
                    className="input-dark text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-zinc-400">Приз</span>
                  <input
                    type="text"
                    placeholder="100"
                    value={formData.prize}
                    onChange={(e) => setFormData({ ...formData, prize: e.target.value })}
                    required
                    className="input-dark text-sm"
                  />
                </label>
              </div>

              <div>
                <span className="mb-1 block text-xs font-semibold text-zinc-400">Соорганизаторы</span>
                <div className="flex gap-2">
                  <UserSearchInput
                    value={draftOrganizerNickname}
                    onChange={setDraftOrganizerNickname}
                    onSelect={(selectedUser) => {
                      if (!draftOrganizerNicknames.includes(selectedUser.nickname)) {
                        setDraftOrganizerNicknames((prev) => [...prev, selectedUser.nickname]);
                      }
                      setDraftOrganizerNickname('');
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddDraftOrganizer}
                    className="rounded-lg bg-white/10 px-3 text-zinc-200 transition hover:bg-white/20"
                    title="Добавить соорганизатора"
                  >
                    <UserPlus size={18} />
                  </button>
                </div>
                {draftOrganizerNicknames.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {draftOrganizerNicknames.map((nickname) => (
                      <span
                        key={nickname}
                        className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-violet-200"
                      >
                        @{nickname}
                        <button
                          type="button"
                          onClick={() => handleRemoveDraftOrganizer(nickname)}
                          className="text-violet-200 hover:text-white"
                          title="Убрать"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-zinc-400">Описание</span>
              <RichTextEditor
                value={formData.description}
                onChange={(description) => setFormData({ ...formData, description })}
              />
            </label>
          </div>
        </form>
      )}

      <div className={`grid gap-6 lg:grid-cols-[minmax(22rem,28rem)_1fr] ${mainTab !== 'games' ? 'hidden' : ''}`}>
        {/* Games List */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Квесты</h2>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="btn-grad p-2 rounded transition"
            >
              <Plus size={20} />
            </button>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {visibleGames.map((game) => (
              <div
                key={game._id}
                className={`p-3 rounded cursor-pointer transition ${
                  selectedGame === game._id
                    ? 'bg-primary text-white'
                    : 'bg-white/5 hover:bg-white/10'
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
                      className="text-violet-400 hover:text-violet-300 p-1"
                      title="Управление заданиями"
                    >
                      <Settings size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteGame(game._id);
                      }}
                      className="text-rose-400 hover:text-rose-300 p-1"
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
        <div>
          {selectedGame ? (
            <div>
              <div className="flex gap-2 mb-4 border-b">
                <button
                  onClick={() => setActiveTab('appls')}
                  className={`px-4 py-2 font-bold border-b-2 ${
                    activeTab === 'appls'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  Заявки ({gameAppls.length})
                </button>
                <button
                  onClick={() => setActiveTab('results')}
                  className={`px-4 py-2 font-bold border-b-2 ${
                    activeTab === 'results'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  Результаты ({gameResults.length})
                </button>
                <button
                  onClick={() => setActiveTab('organizers')}
                  className={`px-4 py-2 font-bold border-b-2 ${
                    activeTab === 'organizers'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  Организаторы ({1 + (currentGame?.organizers?.length || 0)})
                </button>
              </div>

              {/* Заявки Tab */}
              {activeTab === 'appls' && (
                <div>
                  {gameAppls.length === 0 ? (
                    <p className="text-zinc-400">Заявок нет</p>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {gameAppls.map((appl) => {
                        const captain = appl.team?.captain;
                        const fallbackUser =
                          typeof appl.userId === 'object' ? appl.userId : null;
                        const captainName =
                          captain
                            ? `${captain.firstName || ''} ${captain.lastName || ''}`.trim() || captain.nickname
                            : fallbackUser
                              ? `${fallbackUser.firstName || ''} ${fallbackUser.lastName || ''}`.trim() || fallbackUser.nickname
                              : '-';
                        const captainPhone = captain?.phone || fallbackUser?.phone;

                        return (
                          <div key={appl._id} className="glass p-4">
                            <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
                              <div>
                                <p className="text-xs font-semibold uppercase text-zinc-500">Команда</p>
                                <p className="text-lg font-bold text-zinc-100">
                                  {appl.team?.name || appl.teamName || 'Без названия'}
                                </p>
                                <div className="mt-2 grid gap-2 text-sm text-zinc-400 sm:grid-cols-2">
                                  <div>
                                    <span className="block text-xs text-zinc-500">Капитан</span>
                                    <span>{captainName}</span>
                                    {captain?.nickname && <span className="ml-1">@{captain.nickname}</span>}
                                  </div>
                                  <div>
                                    <span className="block text-xs text-zinc-500">Контакт</span>
                                    <span>{captainPhone || '-'}</span>
                                  </div>
                                  <div>
                                    <span className="block text-xs text-zinc-500">Участников</span>
                                    <span>{appl.team?.members?.length || appl.teamMembers?.length || '-'}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-wrap content-start gap-2 xl:max-w-md xl:justify-end">
                                {APPL_STATUSES.map((status) => (
                                  <button
                                    key={status.value}
                                    type="button"
                                    onClick={() => handleUpdateApplStatus(appl._id, status.value)}
                                    className={`rounded-lg border px-3 py-2 text-sm font-bold transition ${
                                      appl.status === status.value
                                        ? 'border-primary bg-primary text-white'
                                        : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white'
                                    }`}
                                  >
                                    {status.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Организаторы Tab */}
              {activeTab === 'organizers' && currentGame && (
                <div className="space-y-4">
                  <p className="text-sm text-zinc-400">
                    Организаторы могут править игру, задания, модерировать заявки,
                    смотреть логи и публиковать результаты.
                  </p>

                  <div className="glass p-4 flex justify-between items-center">
                    <div>
                      <p className="font-bold">
                        @{typeof currentGame.createdBy === 'object'
                          ? currentGame.createdBy?.nickname
                          : '-'}
                      </p>
                      <p className="text-sm text-zinc-400">Создатель игры</p>
                    </div>
                    <span className="inline-block bg-amber-400/10 text-amber-300 text-xs px-3 py-1 rounded-full font-semibold">
                      Создатель
                    </span>
                  </div>

                  {(currentGame.organizers || []).map((org: GameOrganizer) => (
                    <div
                      key={org._id}
                      className="glass p-4 flex justify-between items-center"
                    >
                      <div>
                        <p className="font-bold">@{org.nickname}</p>
                        <p className="text-sm text-zinc-400">
                          {org.firstName} {org.lastName}
                        </p>
                      </div>
                      {canManageOrganizers && (
                        <button
                          onClick={() => handleRemoveOrganizer(org._id)}
                          className="bg-rose-600/90 hover:bg-rose-500 text-white font-bold py-1 px-3 rounded text-sm"
                        >
                          Убрать
                        </button>
                      )}
                    </div>
                  ))}

                  {canManageOrganizers ? (
                    <div className="glass p-4">
                      <p className="font-bold mb-2">Добавить организатора</p>
                      <div className="flex gap-2">
                        <UserSearchInput
                          value={newOrganizerNickname}
                          onChange={setNewOrganizerNickname}
                        />
                        <button
                          onClick={handleAddOrganizer}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded text-sm"
                        >
                          Добавить
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">
                      Изменять список организаторов может администратор или создатель игры.
                    </p>
                  )}
                </div>
              )}

              {/* Результаты Tab */}
              {activeTab === 'results' && (
                <div>
                  {gameResults.length === 0 ? (
                    <p className="text-zinc-400">Результатов еще нет</p>
                  ) : (
                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full text-sm">
                        <thead className="bg-[#17112a] sticky top-0">
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
                            <tr key={result._id} className={idx % 2 === 0 ? '' : 'bg-white/[0.02]'}>
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
            <p className="text-zinc-400 text-center">Выберите квест</p>
          )}
        </div>
      </div>
    </div>
  );
}
