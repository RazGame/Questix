import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { teams, ITeam } from '../services/teams';
import { useAuthStore } from '../store/authStore';

export const TeamManager: React.FC = () => {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [team, setTeam] = useState<ITeam | null>(null);
  const [myTeams, setMyTeams] = useState<ITeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberNickname, setNewMemberNickname] = useState('');

  useEffect(() => {
    if (teamId) {
      loadTeam();
    } else {
      loadMyTeams();
    }
  }, [teamId]);

  const loadTeam = async () => {
    try {
      setLoading(true);
      if (teamId) {
        const data = await teams.getTeam(teamId);
        setTeam(data);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка загрузки команды');
    } finally {
      setLoading(false);
    }
  };

  const loadMyTeams = async () => {
    try {
      setLoading(true);
      const data = await teams.getUserTeams();
      setMyTeams(data);
      setShowCreateForm(data.length === 0);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка загрузки команд');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) {
      setError('Укажите название команды');
      return;
    }

    try {
      setIsCreating(true);
      const newTeam = await teams.create(newTeamName);
      setNewTeamName('');
      setError(null);
      navigate(`/teams/${newTeam._id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка создания команды');
    } finally {
      setIsCreating(false);
    }
  };

  const handleAddMember = async () => {
    if (!team || !newMemberNickname.trim()) {
      setError('Укажите никнейм участника');
      return;
    }

    try {
      const updated = await teams.addMember(team._id!, newMemberNickname.trim());
      setTeam(updated);
      setNewMemberNickname('');
      setShowAddMember(false);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка добавления участника');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!team) return;

    if (confirm('Вы уверены, что хотите удалить этого участника?')) {
      try {
        const updated = await teams.removeMember(team._id!, memberId);
        setTeam(updated);
        setError(null);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Ошибка удаления участника');
      }
    }
  };

  const handleTransferCaptain = async (newCaptainId: string) => {
    if (!team) return;

    if (confirm('Вы уверены, что хотите передать права капитана?')) {
      try {
        const updated = await teams.transferCaptain(team._id!, newCaptainId);
        setTeam(updated);
        setError(null);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Ошибка передачи прав');
      }
    }
  };

  const handleLeaveTeam = async () => {
    if (!team) return;

    if (confirm('Вы уверены, что хотите выйти из команды?')) {
      try {
        await teams.leave(team._id!);
        navigate('/teams');
      } catch (err: any) {
        setError(err.response?.data?.error || 'Ошибка выхода из команды');
      }
    }
  };

  const isCaptain = team && team.captain._id === user?.id;
  const isMember = team && team.members.some((m) => m._id === user?.id);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Список команд пользователя + создание (роут /teams без ID)
  if (!teamId) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          {error && <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">{error}</div>}

          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Мои команды</h1>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
            >
              + Создать команду
            </button>
          </div>

          {showCreateForm && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-bold mb-4">Новая команда</h2>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Название команды</label>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="Введите название"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleCreateTeam}
                disabled={isCreating}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                {isCreating ? 'Создание...' : 'Создать команду'}
              </button>
            </div>
          )}

          {myTeams.length === 0 && !showCreateForm && (
            <p className="text-gray-600">Вы пока не состоите ни в одной команде.</p>
          )}

          <div className="space-y-4">
            {myTeams.map((t) => (
              <Link
                key={t._id}
                to={`/teams/${t._id}`}
                className="block bg-white rounded-lg shadow p-6 hover:shadow-md transition"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{t.name}</h2>
                    <p className="text-sm text-gray-600 mt-1">
                      Капитан: {t.captain.firstName} {t.captain.lastName} (@{t.captain.nickname})
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm text-gray-600">{t.members.length} участн.</span>
                    {t.captain._id === user?.id && (
                      <span className="block mt-1 bg-yellow-100 text-yellow-800 text-xs px-3 py-1 rounded-full font-semibold">
                        Вы капитан
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Команда не найдена</h1>
          {error && <p className="text-red-600 mb-4">{error}</p>}
          <button
            onClick={() => navigate('/teams')}
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
          >
            К моим командам
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {error && <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">{error}</div>}

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{team.name}</h1>
              <p className="text-gray-600 mt-2">
                Капитан: {team.captain.firstName} {team.captain.lastName} ({team.captain.nickname})
              </p>
            </div>

            <div className="flex gap-2">
              {isMember && !isCaptain && (
                <button
                  onClick={handleLeaveTeam}
                  className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded"
                >
                  Выйти из команды
                </button>
              )}
              <button
                onClick={() => navigate('/teams')}
                className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
              >
                ← Назад
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Участники ({team.members.length})</h2>

            {isCaptain && (
              <button
                onClick={() => setShowAddMember(!showAddMember)}
                className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded"
              >
                + Добавить участника
              </button>
            )}
          </div>

          {showAddMember && isCaptain && (
            <div className="mb-6 p-4 border border-gray-300 rounded">
              <input
                type="text"
                value={newMemberNickname}
                onChange={(e) => setNewMemberNickname(e.target.value)}
                placeholder="Никнейм пользователя"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 mb-2"
              />
              <button
                onClick={handleAddMember}
                className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded mr-2"
              >
                Добавить
              </button>
              <button
                onClick={() => setShowAddMember(false)}
                className="bg-gray-400 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded"
              >
                Отмена
              </button>
            </div>
          )}

          <div className="space-y-3">
            {team.members.map((member) => (
              <div key={member._id} className="flex justify-between items-center p-4 border border-gray-200 rounded">
                <div>
                  <p className="font-semibold text-gray-900">
                    {member.firstName} {member.lastName}
                  </p>
                  <p className="text-sm text-gray-600">@{member.nickname}</p>
                </div>

                {isCaptain && member._id !== team.captain._id && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleTransferCaptain(member._id)}
                      className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-3 rounded text-sm"
                    >
                      Сделать капитаном
                    </button>

                    <button
                      onClick={() => handleRemoveMember(member._id)}
                      className="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded text-sm"
                    >
                      Удалить
                    </button>
                  </div>
                )}

                {member._id === team.captain._id && (
                  <span className="inline-block bg-yellow-100 text-yellow-800 text-xs px-3 py-1 rounded-full font-semibold">
                    Капитан
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
