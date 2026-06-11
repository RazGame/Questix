import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { applService } from '../services/appls';
import { GameAppl } from '../types';
import { Clock, Play } from 'lucide-react';
import { formatDateTime, getQuestState } from '../utils/date';
import { useAuthStore } from '../store/authStore';

const statusColors: Record<string, string> = {
  pending: 'bg-amber-400/10 text-amber-300',
  approved: 'bg-emerald-400/10 text-emerald-300',
  rejected: 'bg-rose-400/10 text-rose-300',
  completed: 'bg-sky-400/10 text-sky-300',
};

const statusLabels: Record<string, string> = {
  pending: 'На рассмотрении',
  approved: 'Одобрено',
  rejected: 'Отклонено',
  completed: 'Завершено',
};

const getGameFromAppl = (appl: GameAppl) => (appl as any).gameId;

const getApplPriority = (appl: GameAppl, now: Date) => {
  const game = getGameFromAppl(appl);
  const questState = getQuestState(game?.dateofstart, game?.dateofend, now);

  if (appl.status === 'approved' && questState === 'active') return 0;
  if (appl.status === 'approved' && questState === 'scheduled') return 1;
  if (appl.status === 'pending') return 2;
  if (appl.status === 'rejected') return 3;
  if (appl.status === 'approved' && questState === 'finished') return 4;
  return 5;
};

export default function MyAppls() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [appls, setAppls] = useState<GameAppl[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    loadAppls();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const loadAppls = async () => {
    try {
      setIsLoading(true);
      setError('');
      const data = await applService.getMyAppls();
      setAppls(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка загрузки заявок');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="text-center py-10">Загружается...</div>;
  }

  const sortedAppls = [...appls].sort((a, b) => {
    const priorityDiff = getApplPriority(a, now) - getApplPriority(b, now);

    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    const aStart = new Date(getGameFromAppl(a)?.dateofstart || 0).getTime();
    const bStart = new Date(getGameFromAppl(b)?.dateofstart || 0).getTime();
    return aStart - bStart;
  });

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-4xl font-bold mb-8">Мои заявки</h1>
      {user && (
        <p className="text-zinc-400 mb-4">
          Аккаунт: <strong>{user.nickname}</strong> ({user.username})
        </p>
      )}

      {error && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded">
          {error}
        </div>
      )}

      {sortedAppls.length === 0 ? (
        <p className="text-center text-zinc-400">Заявок не найдено</p>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-1 gap-6">
          {sortedAppls.map((appl) => {
            const game = getGameFromAppl(appl);
            const questState = getQuestState(game?.dateofstart, game?.dateofend, now);
            const canEnterGame = questState === 'active';

            return (
            <div key={appl._id} className="glass p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold">
                    {(appl as any).gameId?.title || 'N/A'}
                  </h3>
                  <p className="text-zinc-400">
                    {(appl as any).gameId?.city || 'N/A'}
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-bold ${
                    statusColors[appl.status]
                  }`}
                >
                  {statusLabels[appl.status]}
                </span>
              </div>

              <div className="space-y-2 mb-4 text-zinc-400">
                <p>
                  <strong>Приз:</strong> {(appl as any).gameId?.prize}
                </p>
                <p>
                  <strong>Депозит:</strong> {(appl as any).gameId?.deposit}
                </p>
                <p>
                  <strong>Дата начала:</strong>{' '}
                  {formatDateTime(game?.dateofstart)}
                </p>
                <p>
                  <strong>Дата окончания:</strong>{' '}
                  {formatDateTime(game?.dateofend)}
                </p>
                {appl.teamName && (
                  <p>
                    <strong>Ваша команда:</strong> {appl.teamName}
                  </p>
                )}
              </div>

              {appl.status === 'approved' && canEnterGame && (
                <button
                  onClick={() =>
                    navigate(`/game/${(appl as any).gameId._id}/play/${appl._id}`)
                  }
                  className="w-full btn-grad py-2 rounded transition flex items-center justify-center gap-2"
                >
                  <Play size={20} /> Войти в игру
                </button>
              )}
              {appl.status === 'approved' && !canEnterGame && (
                <button
                  disabled
                  className="w-full bg-white/5 text-zinc-500 py-2 rounded flex items-center justify-center gap-2 cursor-not-allowed"
                >
                  <Clock size={20} /> {questState === 'finished' ? 'Игра завершена' : 'Игра еще не началась'}
                </button>
              )}
              {questState === 'finished' && game?.published && (
                <button
                  onClick={() => navigate(`/games/${game._id}/results`)}
                  className="w-full mt-2 bg-emerald-600 text-white py-2 rounded hover:bg-emerald-500 transition"
                >
                  📊 Результаты игры
                </button>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
