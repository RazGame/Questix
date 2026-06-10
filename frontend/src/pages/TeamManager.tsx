import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Crown, Edit2, LogOut, Plus, Save, Shield, Trash2, UserPlus, Users, X } from 'lucide-react';
import { teams, ITeam } from '../services/teams';
import { useAuthStore } from '../store/authStore';
import UserSearchInput from '../components/UserSearchInput';

export const TeamManager: React.FC = () => {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [team, setTeam] = useState<ITeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [editedTeamName, setEditedTeamName] = useState('');
  const [isEditingTeam, setIsEditingTeam] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberNickname, setNewMemberNickname] = useState('');

  useEffect(() => {
    loadTeamView();
  }, [teamId]);

  const loadTeamView = async () => {
    try {
      setLoading(true);
      setError(null);

      if (teamId) {
        const data = await teams.getTeam(teamId);
        setTeam(data);
        setEditedTeamName(data.name);
        return;
      }

      const data = await teams.getUserTeams();
      setTeam(data[0] || null);
      setEditedTeamName(data[0]?.name || '');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка загрузки команды');
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
      const created = await teams.create(newTeamName.trim());
      setNewTeamName('');
      setTeam(created);
      setError(null);
      navigate(`/teams/${created._id}`);
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

  const handleUpdateTeam = async () => {
    if (!team || !editedTeamName.trim()) {
      setError('Укажите название команды');
      return;
    }

    try {
      const updated = await teams.update(team._id!, { name: editedTeamName.trim() });
      setTeam(updated);
      setEditedTeamName(updated.name);
      setIsEditingTeam(false);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка обновления команды');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!team) return;

    if (confirm('Удалить участника из команды?')) {
      try {
        setTeam(await teams.removeMember(team._id!, memberId));
        setError(null);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Ошибка удаления участника');
      }
    }
  };

  const handleTransferCaptain = async (newCaptainId: string) => {
    if (!team) return;

    if (confirm('Передать права капитана этому участнику?')) {
      try {
        setTeam(await teams.transferCaptain(team._id!, newCaptainId));
        setError(null);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Ошибка передачи прав');
      }
    }
  };

  const handleLeaveTeam = async () => {
    if (!team) return;

    if (confirm('Выйти из команды?')) {
      try {
        await teams.leave(team._id!);
        setTeam(null);
        navigate('/teams');
      } catch (err: any) {
        setError(err.response?.data?.error || 'Ошибка выхода из команды');
      }
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  const isCaptain = !!team && team.captain._id === user?.id;
  const isMember = !!team && team.members.some((member) => member._id === user?.id);
  const captainName = team
    ? `${team.captain.firstName} ${team.captain.lastName}`.trim() || team.captain.nickname
    : '';
  const initials = team?.name
    ?.split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {error && (
        <div className="mb-4 rounded border border-rose-500/30 bg-rose-500/10 p-4 text-rose-300">
          {error}
        </div>
      )}

      {!team ? (
        <div className="mx-auto max-w-xl">
          <div className="glass p-6">
            <h1 className="mb-4 text-2xl font-bold">Создать команду</h1>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-300">Название команды</span>
              <input
                type="text"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="Введите название"
                className="input-dark"
              />
            </label>
            <button
              onClick={handleCreateTeam}
              disabled={isCreating}
              className="btn-grad mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 font-bold disabled:opacity-50"
            >
              <Plus size={18} />
              {isCreating ? 'Создание...' : 'Создать команду'}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
          <div className="glass p-6 text-center">
            <div className="mx-auto mb-4 flex h-28 w-28 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-violet-500 to-fuchsia-500 text-4xl font-bold text-white shadow-glow-sm">
              {initials}
            </div>
            {isEditingTeam ? (
              <div className="space-y-3">
                <input
                  value={editedTeamName}
                  onChange={(e) => setEditedTeamName(e.target.value)}
                  className="input-dark text-center text-lg font-bold"
                />
                <div className="flex justify-center gap-2">
                  <button
                    onClick={handleUpdateTeam}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-500"
                    title="Сохранить"
                  >
                    <Save size={16} />
                  </button>
                  <button
                    onClick={() => {
                      setEditedTeamName(team.name);
                      setIsEditingTeam(false);
                    }}
                    className="rounded-lg bg-white/10 px-3 py-2 text-sm font-bold text-zinc-200 hover:bg-white/20"
                    title="Отмена"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <h1 className="text-2xl font-bold">{team.name}</h1>
            )}
            <p className="mt-1 text-zinc-400">{team.members.length} участн.</p>
            {isCaptain && (
              <div className="mt-4 space-y-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-amber-400/10 px-3 py-1 text-sm font-bold text-amber-300">
                  <Crown size={16} />
                  Вы капитан
                </span>
                {!isEditingTeam && (
                  <button
                    onClick={() => setIsEditingTeam(true)}
                    className="mx-auto flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-zinc-200 transition hover:bg-white/10"
                  >
                    <Edit2 size={16} />
                    Редактировать
                  </button>
                )}
              </div>
            )}
            {isMember && !isCaptain && (
              <button
                onClick={handleLeaveTeam}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-rose-600/90 px-4 py-2 font-bold text-white transition hover:bg-rose-500"
              >
                <LogOut size={18} />
                Выйти из команды
              </button>
            )}
          </div>

          <div className="space-y-5">
            <div className="glass overflow-hidden">
              <div className="divide-y divide-white/10">
                <div className="grid gap-2 px-6 py-4 sm:grid-cols-[11rem_1fr]">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Shield size={17} className="text-violet-300" />
                    Капитан
                  </div>
                  <div className="font-semibold text-zinc-100">
                    <button
                      onClick={() => navigate(`/profile/${team.captain._id}`)}
                      className="text-left transition hover:text-violet-300"
                    >
                      {captainName} <span className="text-zinc-400">@{team.captain.nickname}</span>
                    </button>
                  </div>
                </div>
                <div className="grid gap-2 px-6 py-4 sm:grid-cols-[11rem_1fr]">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Users size={17} className="text-violet-300" />
                    Участники
                  </div>
                  <div className="font-semibold text-zinc-100">{team.members.length}</div>
                </div>
              </div>
            </div>

            <div className="glass p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold">Состав команды</h2>
                {isCaptain && (
                  <button
                    onClick={() => setShowAddMember((value) => !value)}
                    className="rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white transition hover:bg-emerald-500"
                  >
                    <UserPlus size={18} className="mr-2 inline" />
                    Добавить
                  </button>
                )}
              </div>

              {showAddMember && isCaptain && (
                <div className="mb-4 flex gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <UserSearchInput
                    value={newMemberNickname}
                    onChange={setNewMemberNickname}
                    onSelect={(selectedUser) => setNewMemberNickname(selectedUser.nickname)}
                  />
                  <button
                    onClick={handleAddMember}
                    className="rounded-lg bg-emerald-600 px-4 font-bold text-white hover:bg-emerald-500"
                  >
                    Добавить
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {team.members.map((member) => (
                  <div
                    key={member._id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 p-4"
                  >
                    <button
                      onClick={() => navigate(`/profile/${member._id}`)}
                      className="text-left"
                    >
                      <p className="font-semibold text-zinc-100">
                        {member.firstName} {member.lastName}
                      </p>
                      <p className="text-sm text-zinc-400">@{member.nickname}</p>
                    </button>

                    {member._id === team.captain._id ? (
                      <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-300">
                        Капитан
                      </span>
                    ) : (
                      isCaptain && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleTransferCaptain(member._id)}
                            className="btn-grad rounded px-3 py-1 text-sm font-bold"
                          >
                            Сделать капитаном
                          </button>
                          <button
                            onClick={() => handleRemoveMember(member._id)}
                            className="rounded bg-rose-600/90 px-3 py-1 text-sm font-bold text-white hover:bg-rose-500"
                            title="Удалить участника"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
