import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Crown, Edit2, Mail, MapPin, Phone, Save, User, Users, X } from 'lucide-react';
import { AdminUser, userService } from '../services/users';
import { ITeam, teams } from '../services/teams';
import { useAuthStore } from '../store/authStore';

export default function Profile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user, token, setUser } = useAuthStore();
  const isOwnProfile = !userId || userId === user?.id;
  const [profileUser, setProfileUser] = useState<AdminUser | null>(null);
  const [profileTeam, setProfileTeam] = useState<ITeam | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    nickname: '',
    city: '',
    phone: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, [userId, user?.id]);

  const applyUser = (nextUser: AdminUser) => {
    setProfileUser(nextUser);
    setFormData({
      firstName: nextUser.firstName || '',
      lastName: nextUser.lastName || '',
      nickname: nextUser.nickname || '',
      city: nextUser.city || '',
      phone: nextUser.phone || '',
    });
  };

  const loadProfile = async () => {
    try {
      setIsLoading(true);
      setError('');

      const targetUser = isOwnProfile
        ? ({
            _id: user!.id,
            firstName: user!.firstName,
            lastName: user!.lastName,
            nickname: user!.nickname,
            username: user!.username,
            city: user!.city,
            phone: user!.phone,
            roles: user!.roles,
          } as AdminUser)
        : await userService.getById(userId!);

      applyUser(targetUser);
      setProfileTeam(await teams.getUserTeam(targetUser._id));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка загрузки профиля');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      setIsSaving(true);
      const updated = await userService.updateProfile(formData);

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

      applyUser(updated);
      setSuccess('Профиль обновлен');
      setIsEditing(false);
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

  if (isLoading) {
    return <div className="py-10 text-center">Загружается...</div>;
  }

  if (!profileUser) {
    return <div className="py-10 text-center text-rose-400">Профиль не найден</div>;
  }

  const fullName =
    `${profileUser.firstName || ''} ${profileUser.lastName || ''}`.trim() || 'Без имени';
  const initials =
    `${profileUser.firstName?.[0] || ''}${profileUser.lastName?.[0] || ''}` ||
    profileUser.nickname?.[0] ||
    '?';
  const isTeamCaptain = !!profileTeam && profileTeam.captain._id === profileUser._id;
  const canEditTeam = !!profileTeam && profileTeam.captain._id === user?.id;

  const fields: Array<{ key: keyof typeof formData; label: string }> = [
    { key: 'firstName', label: 'Имя' },
    { key: 'lastName', label: 'Фамилия' },
    { key: 'nickname', label: 'Никнейм' },
    { key: 'city', label: 'Город' },
    { key: 'phone', label: 'Телефон' },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {error && (
        <div className="mb-4 rounded border border-rose-500/20 bg-rose-500/10 p-3 text-rose-300">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded border border-emerald-500/20 bg-emerald-500/10 p-3 text-emerald-300">
          {success}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        <div className="glass p-6 text-center">
          <div className="mx-auto mb-4 flex h-28 w-28 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-violet-500 to-fuchsia-500 text-4xl font-bold text-white shadow-glow-sm">
            {initials.toUpperCase()}
          </div>
          <h1 className="text-2xl font-bold">{fullName}</h1>
          <p className="mt-1 text-zinc-400">@{profileUser.nickname}</p>
          {isTeamCaptain && (
            <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-400/10 px-3 py-1 text-sm font-bold text-amber-300">
              <Crown size={16} />
              Капитан
            </span>
          )}
          {isOwnProfile && (
            <div className="mt-5 flex justify-center">
              <button
                onClick={() => setIsEditing((value) => !value)}
                className="btn-grad flex items-center gap-2 rounded-lg px-4 py-2 font-bold"
              >
                {isEditing ? <X size={18} /> : <Edit2 size={18} />}
                {isEditing ? 'Закрыть' : 'Редактировать'}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="glass overflow-hidden">
            <div className="divide-y divide-white/10">
              {[
                { icon: User, label: 'Полное имя', value: fullName },
                { icon: Mail, label: 'Email', value: profileUser.username || '-' },
                { icon: Phone, label: 'Телефон', value: profileUser.phone || '-' },
                { icon: MapPin, label: 'Город', value: profileUser.city || '-' },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="grid gap-2 px-6 py-4 sm:grid-cols-[11rem_1fr]">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Icon size={17} className="text-violet-300" />
                    {label}
                  </div>
                  <div className="font-semibold text-zinc-100">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass p-6">
            <div className="mb-4 flex items-center gap-2 text-zinc-400">
              <Users size={18} className="text-violet-300" />
              Команда
            </div>
            {profileTeam ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <button
                    onClick={() => navigate(`/teams/${profileTeam._id}`)}
                    className="text-left text-xl font-bold text-zinc-100 transition hover:text-violet-300"
                  >
                    {profileTeam.name}
                  </button>
                  <p className="mt-1 text-sm text-zinc-400">
                    {profileTeam.members.length} участн. · капитан @{profileTeam.captain.nickname}
                  </p>
                </div>
                <button
                  onClick={() => navigate(`/teams/${profileTeam._id}`)}
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 font-bold text-zinc-200 transition hover:bg-white/10"
                >
                  {canEditTeam ? 'Управлять' : 'Открыть'}
                </button>
              </div>
            ) : (
              <p className="text-zinc-400">Пользователь пока не состоит в команде.</p>
            )}
          </div>
        </div>
      </div>

      {isOwnProfile && isEditing && (
        <form onSubmit={handleSubmit} className="glass mt-5 p-6">
          <h2 className="mb-4 text-xl font-bold">Редактирование профиля</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {fields.map(({ key, label }) => (
              <label key={key} className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-300">{label}</span>
                <input
                  type="text"
                  value={formData[key]}
                  onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                  required
                  className="input-dark"
                />
              </label>
            ))}
          </div>
          <button
            type="submit"
            disabled={isSaving}
            className="mt-5 flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            <Save size={18} />
            {isSaving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </form>
      )}
    </div>
  );
}
