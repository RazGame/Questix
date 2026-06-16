import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { applService } from '../services/appls';
import { GameAppl } from '../types';
import { Clock, Play, MapPin, Trophy, Coins, Users, CalendarClock, CalendarCheck, BarChart3 } from 'lucide-react';
import { formatDateTimeShort, getQuestState } from '../utils/date';

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
    <div className="max-w-5xl mx-auto p-4 py-8">
      <p className="tech-label mb-2">[ мои заявки ]</p>
      <h1 className="text-4xl font-bold mb-6">Мои заявки</h1>

      {error && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded">
          {error}
        </div>
      )}

      {sortedAppls.length === 0 ? (
        <p className="text-center text-zinc-400">Заявок не найдено</p>
      ) : (
        <div className="space-y-5">
          {sortedAppls.map((appl) => {
            const game = getGameFromAppl(appl);
            const questState = getQuestState(game?.dateofstart, game?.dateofend, now);
            const canEnterGame = questState === 'active';

            return (
            <div key={appl._id} className="glass overflow-hidden">
              {/* Шапка с градиентом — как в каталоге */}
              <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-violet-600/45 to-fuchsia-600/25 px-5 py-3">
                <h3 className="font-display line-clamp-1 text-lg font-bold text-white">
                  {game?.title || 'N/A'}
                </h3>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                    statusColors[appl.status]
                  }`}
                >
                  {statusLabels[appl.status]}
                </span>
              </div>

              <div className="p-5">
                <div className="mb-4 grid gap-x-4 gap-y-2.5 text-sm text-zinc-400 sm:grid-cols-2">
                  <div className="flex items-center">
                    <MapPin size={16} className="mr-2 shrink-0" />
                    <span className="truncate">{game?.city || 'N/A'}</span>
                  </div>
                  <div className="flex items-center">
                    <Trophy size={16} className="mr-2 shrink-0" />
                    <span className="truncate">Приз: {game?.prize ?? '—'}</span>
                  </div>
                  <div className="flex items-center">
                    <Coins size={16} className="mr-2 shrink-0" />
                    <span className="truncate">Депозит: {game?.deposit ?? '—'}</span>
                  </div>
                  {appl.teamName && (
                    <div className="flex items-center">
                      <Users size={16} className="mr-2 shrink-0" />
                      <span className="truncate">Команда: {appl.teamName}</span>
                    </div>
                  )}
                  <div className="flex items-start">
                    <CalendarClock size={16} className="mr-2 mt-1 shrink-0" />
                    <div>
                      <span className="block text-xs text-zinc-500">Начало</span>
                      {formatDateTimeShort(game?.dateofstart)}
                    </div>
                  </div>
                  <div className="flex items-start">
                    <CalendarCheck size={16} className="mr-2 mt-1 shrink-0" />
                    <div>
                      <span className="block text-xs text-zinc-500">Окончание</span>
                      {formatDateTimeShort(game?.dateofend)}
                    </div>
                  </div>
                </div>

                {appl.startAt && (
                  <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
                    <Clock size={16} className="shrink-0" />
                    <span>Старт вашей команды: {formatDateTimeShort(appl.startAt)}</span>
                  </div>
                )}

                {appl.status === 'approved' && canEnterGame && (
                  <button
                    onClick={() =>
                      navigate(`/game/${(appl as any).gameId._id}/play/${appl._id}`)
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-lg btn-grad py-2.5 font-bold transition"
                  >
                    <Play size={18} /> Войти в игру
                  </button>
                )}
                {appl.status === 'approved' && !canEnterGame && (
                  <button
                    disabled
                    className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-white/5 py-2.5 text-zinc-500"
                  >
                    <Clock size={18} /> {questState === 'finished' ? 'Игра завершена' : 'Игра еще не началась'}
                  </button>
                )}
                {questState === 'finished' && game?.published && (
                  <button
                    onClick={() => navigate(`/games/${game._id}/results`)}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 font-bold text-white transition hover:bg-emerald-500"
                  >
                    <BarChart3 size={18} /> Результаты игры
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
