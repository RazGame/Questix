import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { gameService } from '../services/games';
import { applService } from '../services/appls';
import { progressService } from '../services/progress';
import { taskService } from '../services/tasks';
import { userService, AdminUser } from '../services/users';
import { Game, GameAppl, GameTeamProgress, GameOrganizer, Task, TaskOrderMode, GameParticipation } from '../types';
import { ArrowDown, ArrowUp, Edit2, Plus, Save, Search, Settings, Trash2, UserPlus, X } from 'lucide-react';
import { dateTimeLocalToIso, getQuestState } from '../utils/date';
import { useAuthStore } from '../store/authStore';
import RichTextEditor from '../components/RichTextEditor';
import UserSearchInput from '../components/UserSearchInput';
import MusicAdmin from './MusicAdmin';

const organizerId = (value: Game['createdBy']): string | undefined =>
  typeof value === 'object' ? value?._id : value;

// Роли, которые администратор может назначать вручную.
// team_captain выдается автоматически при создании команды.
const ASSIGNABLE_ROLES: Array<{ value: string; label: string }> = [
  { value: 'admin', label: 'Администратор' },
  { value: 'organizer', label: 'Организатор' },
];

const ORDER_MODES: Array<{ value: TaskOrderMode; label: string; hint: string }> = [
  {
    value: 'linear',
    label: 'Линейный',
    hint: 'Все команды проходят задания в одном порядке. Можно назначить каждой команде своё время старта.',
  },
  {
    value: 'random',
    label: 'Случайный',
    hint: 'Каждая команда получает свою случайную последовательность заданий при старте.',
  },
  {
    value: 'manual',
    label: 'Ручной',
    hint: 'Порядок заданий для каждой команды задаёт организатор во вкладке «Заявки».',
  },
];

// мм:сс или ч:мм:сс
const formatSeconds = (seconds?: number | null) => {
  if (seconds === undefined || seconds === null) return '-';
  const abs = Math.abs(seconds);
  const hrs = Math.floor(abs / 3600);
  const mins = Math.floor((abs % 3600) / 60);
  const secs = abs % 60;
  const core =
    hrs > 0
      ? `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${mins}:${secs.toString().padStart(2, '0')}`;
  return seconds < 0 ? `-${core}` : core;
};

const APPL_STATUSES: Array<{ value: GameAppl['status']; label: string; tone: string }> = [
  { value: 'pending', label: 'На рассмотрении', tone: 'bg-amber-400/15 text-amber-200 border-amber-300/30' },
  { value: 'approved', label: 'Одобрено', tone: 'bg-emerald-400/15 text-emerald-200 border-emerald-300/30' },
  { value: 'rejected', label: 'Отклонено', tone: 'bg-rose-400/15 text-rose-200 border-rose-300/30' },
  { value: 'completed', label: 'Завершено', tone: 'bg-sky-400/15 text-sky-200 border-sky-300/30' },
];

type UserColumnFilters = {
  person: string;
  email: string;
  city: string;
  role: string;
};

const toDateTimeLocalValue = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
};

const gameSortWeight = (game: Game) => {
  const state = getQuestState(game.dateofstart, game.dateofend);
  if (state === 'active') return 0;
  if (state === 'scheduled') return 1;
  if (state === 'finished') return 2;
  return 3;
};

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
  const [activeTab, setActiveTab] = useState<'details' | 'appls' | 'results' | 'organizers'>('details');
  const [mainTab, setMainTab] = useState<'games' | 'music' | 'users'>('games');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userFilters, setUserFilters] = useState<UserColumnFilters>({
    person: '',
    email: '',
    city: '',
    role: '',
  });
  const [newOrganizerNickname, setNewOrganizerNickname] = useState('');
  const [draftOrganizerNickname, setDraftOrganizerNickname] = useState('');
  const [draftOrganizerNicknames, setDraftOrganizerNicknames] = useState<string[]>([]);
  const [gameTasks, setGameTasks] = useState<Task[]>([]);
  // Черновики настроек команд: индивидуальный старт и ручной порядок заданий
  const [applStartDrafts, setApplStartDrafts] = useState<Record<string, string>>({});
  const [applOrderDrafts, setApplOrderDrafts] = useState<Record<string, string[]>>({});
  // Черновики штрафов/бонусов по командам (ключ - id заявки)
  const [adjustDrafts, setAdjustDrafts] = useState<Record<string, { minutes: string; reason: string }>>({});

  const isAdmin = !!user?.roles?.includes('admin');

  // Организатор видит только свои игры (созданные им или где он соорганизатор)
  const canModerate = (game: Game): boolean =>
    isAdmin ||
    organizerId(game.createdBy) === user?.id ||
    (game.organizers || []).some((o) => o._id === user?.id);

  const visibleGames = games.filter(canModerate);
  const sortedVisibleGames = [...visibleGames].sort((a, b) => {
    const stateDiff = gameSortWeight(a) - gameSortWeight(b);

    if (stateDiff !== 0) {
      return stateDiff;
    }

    const aStart = new Date(a.dateofstart).getTime();
    const bStart = new Date(b.dateofstart).getTime();

    if (gameSortWeight(a) === 2) {
      return bStart - aStart;
    }

    return aStart - bStart;
  });
  const normalizedUserSearch = userSearch.trim().toLowerCase();
  const userFilterValues = {
    person: userFilters.person.trim().toLowerCase(),
    email: userFilters.email.trim().toLowerCase(),
    city: userFilters.city.trim().toLowerCase(),
    role: userFilters.role,
  };
  const hasUserFilters =
    !!normalizedUserSearch ||
    !!userFilterValues.person ||
    !!userFilterValues.email ||
    !!userFilterValues.city ||
    !!userFilterValues.role;
  const filteredUsers = users.filter((u) => {
    const matchesSearch = normalizedUserSearch
      ? [
          u.nickname,
          u.firstName,
          u.lastName,
          u.username,
          u.city,
          u.phone,
          ...u.roles,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(normalizedUserSearch)
      : true;
    const matchesPerson = userFilterValues.person
      ? [u.nickname, u.firstName, u.lastName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(userFilterValues.person)
      : true;
    const matchesEmail = userFilterValues.email
      ? (u.username || '').toLowerCase().includes(userFilterValues.email)
      : true;
    const matchesCity = userFilterValues.city
      ? (u.city || '').toLowerCase().includes(userFilterValues.city)
      : true;
    const matchesRole = userFilterValues.role ? u.roles.includes(userFilterValues.role) : true;

    return matchesSearch && matchesPerson && matchesEmail && matchesCity && matchesRole;
  });
  const availableUserRoles = Array.from(
    new Set(users.flatMap((u) => u.roles))
  ).sort((a, b) => a.localeCompare(b));
  const clearUserFilters = () => {
    setUserSearch('');
    setUserFilters({
      person: '',
      email: '',
      city: '',
      role: '',
    });
  };
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
    taskOrderMode: 'linear' as TaskOrderMode,
    participation: 'team' as GameParticipation,
  });
  const [editFormData, setEditFormData] = useState({
    title: '',
    city: '',
    dateofstart: '',
    dateofend: '',
    deposit: '',
    prize: '',
    description: '',
    taskOrderMode: 'linear' as TaskOrderMode,
    participation: 'team' as GameParticipation,
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
      taskOrderMode: 'linear',
      participation: 'team',
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

  useEffect(() => {
    if (!currentGame) return;

    setEditFormData({
      title: currentGame.title || '',
      city: currentGame.city || '',
      dateofstart: toDateTimeLocalValue(currentGame.dateofstart),
      dateofend: toDateTimeLocalValue(currentGame.dateofend),
      deposit: currentGame.deposit || '',
      prize: currentGame.prize || '',
      description: currentGame.description || '',
      taskOrderMode: currentGame.taskOrderMode || 'linear',
      participation: (currentGame.participation as GameParticipation) || 'team',
    });
  }, [currentGame?._id]);

  // Задания нужны для ручного порядка во вкладке «Заявки»
  useEffect(() => {
    if (!selectedGame) {
      setGameTasks([]);
      return;
    }

    taskService
      .getGameTasks(selectedGame)
      .then(setGameTasks)
      .catch(() => setGameTasks([]));
  }, [selectedGame]);

  // Черновики настроек команд из загруженных заявок
  useEffect(() => {
    const startDrafts: Record<string, string> = {};
    const orderDrafts: Record<string, string[]> = {};
    const defaultOrder = gameTasks.map((t) => t._id);

    gameAppls.forEach((appl) => {
      startDrafts[appl._id] = toDateTimeLocalValue(appl.startAt || undefined);
      const manual = (appl.taskOrder || []).filter((id) => defaultOrder.includes(id));
      orderDrafts[appl._id] = manual.length === defaultOrder.length ? manual : defaultOrder;
    });

    setApplStartDrafts(startDrafts);
    setApplOrderDrafts(orderDrafts);
  }, [gameAppls, gameTasks]);

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

  const handleUpdateGame = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentGame) return;

    try {
      const updated = await gameService.updateGame(currentGame._id, {
        ...editFormData,
        dateofstart: dateTimeLocalToIso(editFormData.dateofstart),
        dateofend: dateTimeLocalToIso(editFormData.dateofend),
      });
      setGames((prev) => prev.map((game) => (game._id === updated._id ? { ...game, ...updated } : game)));
      setError('');
    } catch (err: any) {
      setError(
        err.response?.data?.errors?.[0] ||
          err.response?.data?.error ||
          'Ошибка обновления квеста'
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

  // Сохранить индивидуальное время старта команды (линейный режим)
  const handleSaveApplStart = async (applId: string) => {
    try {
      const value = applStartDrafts[applId];
      const updated = await applService.updateApplSettings(applId, {
        startAt: value ? dateTimeLocalToIso(value) : null,
      });
      setGameAppls((prev) => prev.map((a) => (a._id === updated._id ? { ...a, ...updated } : a)));
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка сохранения времени старта');
    }
  };

  // Передвинуть задание в ручном порядке команды
  const handleMoveOrderTask = (applId: string, index: number, direction: -1 | 1) => {
    setApplOrderDrafts((prev) => {
      const order = [...(prev[applId] || [])];
      const target = index + direction;

      if (target < 0 || target >= order.length) {
        return prev;
      }

      [order[index], order[target]] = [order[target], order[index]];
      return { ...prev, [applId]: order };
    });
  };

  const handleSaveApplOrder = async (applId: string) => {
    try {
      const updated = await applService.updateApplSettings(applId, {
        taskOrder: applOrderDrafts[applId] || [],
      });
      setGameAppls((prev) => prev.map((a) => (a._id === updated._id ? { ...a, ...updated } : a)));
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка сохранения порядка заданий');
    }
  };

  // Штраф (sign = 1) или бонус (sign = -1) ко времени команды
  const handleAdjustTime = async (applId: string, sign: 1 | -1) => {
    const draft = adjustDrafts[applId] || { minutes: '', reason: '' };
    const minutes = parseFloat(draft.minutes.replace(',', '.'));

    if (!minutes || minutes <= 0) {
      setError('Укажите количество минут больше нуля');
      return;
    }

    if (!draft.reason.trim()) {
      setError('Укажите причину штрафа или бонуса');
      return;
    }

    try {
      await progressService.adjustTime(
        applId,
        Math.round(minutes * 60) * sign,
        draft.reason.trim()
      );
      setAdjustDrafts((prev) => ({ ...prev, [applId]: { minutes: '', reason: '' } }));
      setError('');
      loadGameResults();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка корректировки времени');
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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <h1 className="text-4xl font-bold">{isAdmin ? 'Админ панель' : 'Мои игры'}</h1>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded">
          {error}
        </div>
      )}

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
          onClick={() => setMainTab('music')}
          className={`px-4 py-2 font-bold border-b-2 ${
            mainTab === 'music'
              ? 'border-primary text-primary'
              : 'border-transparent text-zinc-400 hover:text-zinc-100'
          }`}
        >
          Угадай мелодию
        </button>
        {isAdmin && (
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
        )}
      </div>

      {mainTab === 'users' && (
        <div className="glass overflow-hidden">
          {!usersLoaded ? (
            <div className="p-6 text-center text-zinc-400">Загрузка пользователей...</div>
          ) : (
            <div>
              <div className="border-b border-white/10 p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="relative block min-w-[16rem] flex-1 max-w-md">
                    <Search
                      size={17}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                    />
                    <input
                      type="search"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Поиск по всем столбцам"
                      className="input-dark pl-10"
                    />
                  </label>
                  {hasUserFilters && (
                    <button
                      type="button"
                      onClick={clearUserFilters}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-zinc-200 transition hover:bg-white/10"
                    >
                      <X size={16} />
                      Сбросить
                    </button>
                  )}
                  <span className="text-sm text-zinc-500">
                    Найдено: {filteredUsers.length} из {users.length}
                  </span>
                </div>
              </div>

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
                    <tr className="border-t border-white/10 bg-[#17111f]">
                      <th className="px-4 py-2 text-left">
                        <input
                          type="search"
                          value={userFilters.person}
                          onChange={(e) => setUserFilters((prev) => ({ ...prev, person: e.target.value }))}
                          placeholder="Ник или имя"
                          className="input-dark py-1.5 text-xs"
                        />
                      </th>
                      <th className="px-4 py-2 text-left">
                        <input
                          type="search"
                          value={userFilters.email}
                          onChange={(e) => setUserFilters((prev) => ({ ...prev, email: e.target.value }))}
                          placeholder="Email"
                          className="input-dark py-1.5 text-xs"
                        />
                      </th>
                      <th className="px-4 py-2 text-left">
                        <input
                          type="search"
                          value={userFilters.city}
                          onChange={(e) => setUserFilters((prev) => ({ ...prev, city: e.target.value }))}
                          placeholder="Город"
                          className="input-dark py-1.5 text-xs"
                        />
                      </th>
                      <th className="px-4 py-2 text-left">
                        <select
                          value={userFilters.role}
                          onChange={(e) => setUserFilters((prev) => ({ ...prev, role: e.target.value }))}
                          className="input-dark py-1.5 text-xs"
                        >
                          <option value="">Все роли</option>
                          {availableUserRoles.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {filteredUsers.map((u) => (
                      <tr key={u._id} className="hover:bg-white/5">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => navigate(`/profile/${u._id}`)}
                            className="text-left transition hover:text-violet-300"
                          >
                            <div className="font-bold text-zinc-100 hover:text-violet-300">@{u.nickname}</div>
                            <div className="text-zinc-400">
                              {`${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Без имени'}
                            </div>
                          </button>
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
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                          Пользователи не найдены
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {mainTab === 'music' && (
        <MusicAdmin isTab={true} />
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

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-zinc-400">Порядок заданий</span>
                <select
                  value={formData.taskOrderMode}
                  onChange={(e) => setFormData({ ...formData, taskOrderMode: e.target.value as TaskOrderMode })}
                  className="input-dark text-sm"
                >
                  {ORDER_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-zinc-500">
                  {ORDER_MODES.find((m) => m.value === formData.taskOrderMode)?.hint}
                </span>
              </label>

              {/* Оси игры. Квест всегда с авторизацией. */}
              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Участники</p>
                  <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-1">
                    {([
                      { v: 'team', label: 'Командный' },
                      { v: 'solo', label: 'Одиночный' },
                    ] as const).map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => setFormData({ ...formData, participation: o.v })}
                        className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                          formData.participation === o.v ? 'btn-grad' : 'text-zinc-300 hover:bg-white/10'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Вход</p>
                  <span className="inline-block rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-zinc-300">
                    🔒 По аккаунту (квест всегда с авторизацией)
                  </span>
                </div>
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
                    excludeIds={user?.id ? [user.id] : []}
                    excludeNicknames={draftOrganizerNicknames}
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

          <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto">
            {sortedVisibleGames.map((game) => {
              const state = getQuestState(game.dateofstart, game.dateofend);

              return (
              <div
                key={game._id}
                className={`p-3 rounded cursor-pointer transition ${
                  selectedGame === game._id
                    ? 'bg-primary text-white'
                    : state === 'finished'
                      ? 'bg-white/[0.02] opacity-60 hover:opacity-100 hover:bg-white/10'
                      : 'bg-white/5 hover:bg-white/10'
                }`}
                onClick={() => setSelectedGame(game._id)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{game.title}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide ${
                          selectedGame === game._id
                            ? 'bg-white/20 text-white'
                            : state === 'active'
                              ? 'bg-emerald-400/15 text-emerald-300'
                              : state === 'scheduled'
                                ? 'bg-sky-400/15 text-sky-300'
                                : 'bg-white/10 text-zinc-400'
                        }`}
                      >
                        {state === 'active' ? 'Идёт' : state === 'scheduled' ? 'Скоро' : 'Завершён'}
                      </span>
                    </div>
                    <p className="text-sm opacity-75">{game.city}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedGame(game._id);
                        setActiveTab('details');
                      }}
                      className="text-zinc-300 hover:text-white p-1"
                      title="Редактировать квест"
                    >
                      <Edit2 size={16} />
                    </button>
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
              );
            })}
          </div>
        </div>

        {/* Main Panel */}
        <div>
          {selectedGame ? (
            <div>
              <div className="flex gap-2 mb-4 border-b">
                <button
                  onClick={() => setActiveTab('details')}
                  className={`px-4 py-2 font-bold border-b-2 ${
                    activeTab === 'details'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  Квест
                </button>
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

              {activeTab === 'details' && currentGame && (
                <form onSubmit={handleUpdateGame} className="glass p-5">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-bold">Редактирование квеста</h2>
                      <p className="mt-1 text-sm text-zinc-400">
                        {getQuestState(currentGame.dateofstart, currentGame.dateofend) === 'active'
                          ? 'Игра сейчас идет'
                          : getQuestState(currentGame.dateofstart, currentGame.dateofend) === 'scheduled'
                            ? 'Предстоящая игра'
                            : 'Завершенная игра'}
                      </p>
                    </div>
                    <button
                      type="submit"
                      className="btn-grad flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold"
                    >
                      <Save size={17} />
                      Сохранить
                    </button>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-[minmax(20rem,25rem)_1fr]">
                    <div className="space-y-4">
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-zinc-400">Название квеста</span>
                        <input
                          type="text"
                          value={editFormData.title}
                          onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                          required
                          className="input-dark text-sm"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-zinc-400">Город</span>
                        <input
                          type="text"
                          value={editFormData.city}
                          onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })}
                          required
                          className="input-dark text-sm"
                        />
                      </label>

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold text-zinc-400">Дата и время начала</span>
                          <input
                            type="datetime-local"
                            value={editFormData.dateofstart}
                            onChange={(e) => setEditFormData({ ...editFormData, dateofstart: e.target.value })}
                            required
                            className="input-dark text-sm"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold text-zinc-400">Дата и время окончания</span>
                          <input
                            type="datetime-local"
                            value={editFormData.dateofend}
                            onChange={(e) => setEditFormData({ ...editFormData, dateofend: e.target.value })}
                            required
                            className="input-dark text-sm"
                          />
                        </label>
                      </div>

                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-zinc-400">Порядок заданий</span>
                        <select
                          value={editFormData.taskOrderMode}
                          onChange={(e) =>
                            setEditFormData({ ...editFormData, taskOrderMode: e.target.value as TaskOrderMode })
                          }
                          className="input-dark text-sm"
                        >
                          {ORDER_MODES.map((mode) => (
                            <option key={mode.value} value={mode.value}>
                              {mode.label}
                            </option>
                          ))}
                        </select>
                        <span className="mt-1 block text-xs text-zinc-500">
                          {ORDER_MODES.find((m) => m.value === editFormData.taskOrderMode)?.hint}
                        </span>
                      </label>

                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Участники</p>
                        <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-1">
                          {([
                            { v: 'team', label: 'Командный' },
                            { v: 'solo', label: 'Одиночный' },
                          ] as const).map((o) => (
                            <button
                              key={o.v}
                              type="button"
                              onClick={() => setEditFormData({ ...editFormData, participation: o.v })}
                              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                                editFormData.participation === o.v ? 'btn-grad' : 'text-zinc-300 hover:bg-white/10'
                              }`}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold text-zinc-400">Депозит</span>
                          <input
                            type="text"
                            value={editFormData.deposit}
                            onChange={(e) => setEditFormData({ ...editFormData, deposit: e.target.value })}
                            required
                            className="input-dark text-sm"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold text-zinc-400">Приз</span>
                          <input
                            type="text"
                            value={editFormData.prize}
                            onChange={(e) => setEditFormData({ ...editFormData, prize: e.target.value })}
                            required
                            className="input-dark text-sm"
                          />
                        </label>
                      </div>
                    </div>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-zinc-400">Описание</span>
                      <RichTextEditor
                        value={editFormData.description}
                        onChange={(description) => setEditFormData({ ...editFormData, description })}
                      />
                    </label>
                  </div>
                </form>
              )}

              {/* Заявки Tab */}
              {activeTab === 'appls' && (
                <div>
                  {gameAppls.length === 0 ? (
                    <p className="text-zinc-400">Заявок нет</p>
                  ) : (
                    <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto">
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
                            <div className="grid gap-4">
                              <div>
                                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-semibold uppercase text-zinc-500">Команда</p>
                                    <p className="text-lg font-bold text-zinc-100">
                                      {appl.team?.name || appl.teamName || 'Без названия'}
                                    </p>
                                  </div>
                                  <span
                                    className={`rounded-full border px-3 py-1 text-xs font-bold ${
                                      APPL_STATUSES.find((status) => status.value === appl.status)?.tone || 'border-white/10 bg-white/10 text-zinc-200'
                                    }`}
                                  >
                                    {APPL_STATUSES.find((status) => status.value === appl.status)?.label || appl.status}
                                  </span>
                                </div>
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
                              <div className="inline-flex w-fit flex-wrap gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
                                {APPL_STATUSES.map((status) => (
                                  <button
                                    key={status.value}
                                    type="button"
                                    onClick={() => handleUpdateApplStatus(appl._id, status.value)}
                                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                                      appl.status === status.value
                                        ? 'bg-primary text-white shadow-glow-sm'
                                        : 'text-zinc-400 hover:bg-white/10 hover:text-white'
                                    }`}
                                  >
                                    {status.label}
                                  </button>
                                ))}
                              </div>

                              {/* Индивидуальное время старта команды (линейный режим) */}
                              {(currentGame?.taskOrderMode || 'linear') === 'linear' && (
                                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                  <p className="mb-2 text-xs font-semibold uppercase text-zinc-500">
                                    Старт команды
                                  </p>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <input
                                      type="datetime-local"
                                      value={applStartDrafts[appl._id] || ''}
                                      onChange={(e) =>
                                        setApplStartDrafts((prev) => ({ ...prev, [appl._id]: e.target.value }))
                                      }
                                      className="input-dark w-auto text-sm"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleSaveApplStart(appl._id)}
                                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-500"
                                    >
                                      Сохранить
                                    </button>
                                    {applStartDrafts[appl._id] && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setApplStartDrafts((prev) => ({ ...prev, [appl._id]: '' }));
                                        }}
                                        className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-zinc-300 transition hover:bg-white/20"
                                        title="Очистить (команда стартует вместе со всеми)"
                                      >
                                        Сбросить
                                      </button>
                                    )}
                                  </div>
                                  <p className="mt-2 text-xs text-zinc-500">
                                    Пусто - команда может стартовать сразу после начала игры.
                                  </p>
                                </div>
                              )}

                              {/* Ручной порядок заданий для команды */}
                              {currentGame?.taskOrderMode === 'manual' && (
                                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                  <div className="mb-2 flex items-center justify-between">
                                    <p className="text-xs font-semibold uppercase text-zinc-500">
                                      Порядок заданий команды
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveApplOrder(appl._id)}
                                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-500"
                                    >
                                      Сохранить порядок
                                    </button>
                                  </div>
                                  {gameTasks.length === 0 ? (
                                    <p className="text-sm text-zinc-500">У игры пока нет заданий.</p>
                                  ) : (
                                    <div className="space-y-1">
                                      {(applOrderDrafts[appl._id] || []).map((taskId, index) => {
                                        const task = gameTasks.find((t) => t._id === taskId);
                                        const order = applOrderDrafts[appl._id] || [];

                                        return (
                                          <div
                                            key={taskId}
                                            className="flex items-center gap-2 rounded-md bg-white/[0.04] px-3 py-2"
                                          >
                                            <span className="w-6 shrink-0 font-mono text-xs text-violet-300">
                                              {index + 1}.
                                            </span>
                                            <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                                              {task?.title || 'Задание удалено'}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => handleMoveOrderTask(appl._id, index, -1)}
                                              disabled={index === 0}
                                              className="rounded p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                                            >
                                              <ArrowUp size={15} />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleMoveOrderTask(appl._id, index, 1)}
                                              disabled={index === order.length - 1}
                                              className="rounded p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                                            >
                                              <ArrowDown size={15} />
                                            </button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
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
                          excludeIds={[
                            organizerId(currentGame.createdBy) || '',
                            ...(currentGame.organizers || []).map((o) => o._id),
                          ]}
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
                <div className="space-y-3">
                  {gameResults.length === 0 ? (
                    <p className="text-zinc-400">Результатов еще нет</p>
                  ) : (
                    gameResults.map((result) => {
                      const applId =
                        typeof (result as any).gameApplId === 'object'
                          ? (result as any).gameApplId?._id
                          : (result as any).gameApplId;
                      const teamName =
                        (result as any).gameApplId?.team?.name ||
                        (result as any).gameApplId?.teamName ||
                        (result as any).userId?.nickname ||
                        'Команда';
                      const adjustments = result.timeAdjustments || [];
                      const adjustmentsTotal = adjustments.reduce((sum, adj) => sum + adj.amount, 0);
                      const finalTime =
                        result.totalTime !== undefined && result.totalTime !== null
                          ? Math.max(0, result.totalTime + adjustmentsTotal)
                          : null;
                      const draft = adjustDrafts[applId] || { minutes: '', reason: '' };

                      return (
                        <div key={result._id} className="glass p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-lg font-bold text-zinc-100">{teamName}</p>
                              <p className="text-sm text-zinc-400">
                                Капитан: @{(result as any).userId?.nickname || '-'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-xl font-bold text-violet-300">
                                {formatSeconds(finalTime)}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {result.status === 'completed'
                                  ? adjustmentsTotal !== 0
                                    ? `чистое время ${formatSeconds(result.totalTime)}`
                                    : 'итоговое время'
                                  : result.status === 'in_progress'
                                    ? 'в процессе'
                                    : result.status === 'abandoned'
                                      ? 'прервано'
                                      : 'не начато'}
                              </p>
                            </div>
                          </div>

                          {adjustments.length > 0 && (
                            <div className="mt-3 space-y-1">
                              {adjustments.map((adj, idx) => (
                                <div
                                  key={idx}
                                  className={`flex flex-wrap items-center gap-2 rounded-md px-3 py-1.5 text-sm ${
                                    adj.amount > 0
                                      ? 'bg-rose-500/10 text-rose-300'
                                      : 'bg-emerald-500/10 text-emerald-300'
                                  }`}
                                >
                                  <span className="font-mono font-bold">
                                    {adj.amount > 0 ? '+' : '−'}{formatSeconds(Math.abs(adj.amount))}
                                  </span>
                                  <span className="text-zinc-300">{adj.reason}</span>
                                  <span className="ml-auto text-xs text-zinc-500">
                                    @{typeof adj.createdBy === 'object' ? adj.createdBy?.nickname : ''}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              placeholder="Минуты"
                              value={draft.minutes}
                              onChange={(e) =>
                                setAdjustDrafts((prev) => ({
                                  ...prev,
                                  [applId]: { ...draft, minutes: e.target.value },
                                }))
                              }
                              className="input-dark w-24 text-sm"
                            />
                            <input
                              type="text"
                              placeholder="Причина (видна в статистике)"
                              value={draft.reason}
                              onChange={(e) =>
                                setAdjustDrafts((prev) => ({
                                  ...prev,
                                  [applId]: { ...draft, reason: e.target.value },
                                }))
                              }
                              className="input-dark min-w-[12rem] flex-1 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => handleAdjustTime(applId, 1)}
                              className="rounded-lg bg-rose-600/90 px-3 py-2 text-xs font-bold text-white transition hover:bg-rose-500"
                              title="Добавить время (штраф)"
                            >
                              + Штраф
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdjustTime(applId, -1)}
                              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-500"
                              title="Убавить время (бонус)"
                            >
                              − Бонус
                            </button>
                          </div>
                        </div>
                      );
                    })
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
