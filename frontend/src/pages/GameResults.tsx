import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { results, GameStatistics, TeamLogEntry } from '../services/results';
import { useAuthStore } from '../store/authStore';

type TeamStat = GameStatistics['statistics'][number];

// Режим сортировки таблицы:
// place - по итоговому месту/времени;
// step-moment - по моменту прохождения задания на шаге N;
// step-time - по времени, потраченному на задание на шаге N.
type SortMode =
  | { type: 'place' }
  | { type: 'step-moment'; step: number }
  | { type: 'step-time'; step: number };

const actionLabels: Record<TeamLogEntry['action'], string> = {
  game_started: '🚀 Старт игры',
  task_answered: '✍️ Ответ',
  task_correct: '✅ Верный ответ',
  task_incorrect: '❌ Неверный ответ',
  task_passed: '➡️ Переход к заданию',
  game_finished: '🏁 Финиш',
  game_abandoned: '🛑 Прохождение прервано',
};

const formatTime = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined) return '-';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatMoment = (iso: string | null | undefined) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const placeBadge = (place: number | null) => {
  if (!place) return '-';
  if (place === 1) return '🥇 1';
  if (place === 2) return '🥈 2';
  if (place === 3) return '🥉 3';
  return `${place}`;
};

export const GameStatisticsPage: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [stats, setStats] = useState<GameStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>({ type: 'place' });
  const [logs, setLogs] = useState<TeamLogEntry[] | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    if (gameId) {
      loadStatistics();
    }
  }, [gameId]);

  const loadStatistics = async () => {
    try {
      setLoading(true);
      if (gameId) {
        const data = await results.getGameStatistics(gameId);
        setStats(data);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка загрузки статистики');
    } finally {
      setLoading(false);
    }
  };

  const handlePublishResults = async () => {
    if (!gameId) return;

    if (confirm('Опубликовать результаты игры? Это действие необратимо.')) {
      try {
        setPublishing(true);
        await results.publishResults(gameId);
        await loadStatistics();
        setError(null);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Ошибка публикации результатов');
      } finally {
        setPublishing(false);
      }
    }
  };

  const handleToggleLogs = async () => {
    if (showLogs) {
      setShowLogs(false);
      return;
    }

    setShowLogs(true);

    if (logs === null && gameId) {
      try {
        setLogsLoading(true);
        const data = await results.getGameLogs(gameId);
        setLogs(data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Ошибка загрузки логов');
      } finally {
        setLogsLoading(false);
      }
    }
  };

  const isAdmin = user?.roles?.includes('admin');
  const isModerator =
    !!stats &&
    (isAdmin ||
      stats.game.createdBy?._id === user?.id ||
      (stats.game.organizers || []).some((o) => o._id === user?.id));

  const stepsCount = useMemo(() => {
    if (!stats) return 0;
    return Math.max(
      stats.tasks.length,
      ...stats.statistics.map((t) => t.taskResults.length),
      0
    );
  }, [stats]);

  const sortedTeams = useMemo(() => {
    if (!stats) return [];
    const teams = [...stats.statistics];

    const byPlace = (a: TeamStat, b: TeamStat) =>
      (a.place ?? Infinity) - (b.place ?? Infinity);

    if (sortMode.type === 'place') {
      return teams.sort(byPlace);
    }

    const step = sortMode.step;
    return teams.sort((a, b) => {
      const ra = a.taskResults[step];
      const rb = b.taskResults[step];

      if (sortMode.type === 'step-moment') {
        const ta = ra?.completedAt ? new Date(ra.completedAt).getTime() : Infinity;
        const tb = rb?.completedAt ? new Date(rb.completedAt).getTime() : Infinity;
        return ta !== tb ? ta - tb : byPlace(a, b);
      }

      const sa = ra?.timeSpent ?? Infinity;
      const sb = rb?.timeSpent ?? Infinity;
      return sa !== sb ? sa - sb : byPlace(a, b);
    });
  }, [stats, sortMode]);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-[calc(100dvh-4rem)] px-4 py-12">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-100 mb-4">Статистика недоступна</h1>
          {error && <p className="text-yellow-700 mb-4">{error}</p>}
          <button
            onClick={() => navigate('/games')}
            className="btn-grad font-bold py-2 px-4 rounded"
          >
            Вернуться к играм
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {error && <div className="mb-4 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded">{error}</div>}

        {/* Заголовок игры и контекст статистики */}
        <div className="glass p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold text-zinc-100">📊 {stats.game.title}</h1>
              <div
                className="rich-content mt-2 text-zinc-400"
                dangerouslySetInnerHTML={{ __html: stats.game.description }}
              />
              <p className="text-sm text-zinc-500 mt-2">
                {(stats.game.organizers || []).length > 0 ? 'Организаторы' : 'Организатор'}:{' '}
                {[stats.game.createdBy?.nickname, ...(stats.game.organizers || []).map((o) => o.nickname)]
                  .filter(Boolean)
                  .join(', ')}{' '}
                | Заданий: {stats.tasks.length}
              </p>
            </div>

            <div className="text-right">
              <div className="text-2xl font-bold text-zinc-100">
                {stats.completedTeams}/{stats.totalTeams}
              </div>
              <p className="text-sm text-zinc-400">команд завершили</p>

              {isModerator && !stats.game.published && (
                <button
                  onClick={handlePublishResults}
                  disabled={publishing}
                  className="mt-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
                >
                  {publishing ? 'Публикация...' : 'Опубликовать результаты'}
                </button>
              )}

              {stats.game.published && (
                <div className="mt-4 inline-block bg-emerald-400/10 text-emerald-300 text-xs px-3 py-1 rounded-full font-semibold">
                  ✓ Опубликовано
                </div>
              )}
            </div>
          </div>

          {!stats.game.published && isModerator && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded text-sm text-amber-200">
              Результаты пока видны только вам. Участники увидят их после публикации.
            </div>
          )}
        </div>

        {/* Подсказка по сортировке */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
          <span>Сортировка:</span>
          <button
            onClick={() => setSortMode({ type: 'place' })}
            className={`px-3 py-1 rounded-full border ${
              sortMode.type === 'place'
                ? 'bg-primary/100 text-white border-primary'
                : 'bg-white border-white/10 hover:bg-white/5'
            }`}
          >
            по итоговому месту
          </button>
          {sortMode.type !== 'place' && (
            <span className="px-3 py-1 rounded-full bg-sky-400/10 text-sky-300">
              шаг {sortMode.step + 1}:{' '}
              {sortMode.type === 'step-moment' ? 'по моменту прохождения' : 'по времени на задание'}
            </span>
          )}
          <span className="text-zinc-500">
            — в шапке колонки: 🕐 сортировка по моменту, ⏱ по затраченному времени
          </span>
        </div>

        {/* Матрица: строки - команды, колонки - шаги прохождения */}
        <div className="glass overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider sticky left-0 bg-white/5">
                    Команда
                  </th>
                  {Array.from({ length: stepsCount }, (_, i) => (
                    <th key={i} className="px-4 py-3 text-center text-xs font-medium text-zinc-300 uppercase tracking-wider whitespace-nowrap">
                      Шаг {i + 1}
                      <span className="block mt-1 font-normal normal-case">
                        <button
                          title="Сортировать по моменту прохождения"
                          onClick={() => setSortMode({ type: 'step-moment', step: i })}
                          className={`px-1 rounded ${
                            sortMode.type === 'step-moment' && sortMode.step === i
                              ? 'bg-primary/100 text-white'
                              : 'hover:bg-white/10'
                          }`}
                        >
                          🕐
                        </button>{' '}
                        <button
                          title="Сортировать по времени на задание"
                          onClick={() => setSortMode({ type: 'step-time', step: i })}
                          className={`px-1 rounded ${
                            sortMode.type === 'step-time' && sortMode.step === i
                              ? 'bg-primary/100 text-white'
                              : 'hover:bg-white/10'
                          }`}
                        >
                          ⏱
                        </button>
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-xs font-bold text-zinc-100 uppercase tracking-wider bg-primary/10">
                    Итоговое время
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-zinc-100 uppercase tracking-wider bg-primary/10">
                    Место
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {sortedTeams.map((team) => (
                  <tr key={team.teamId} className={team.place === 1 ? 'bg-amber-400/[0.07]' : undefined}>
                    <td className="px-4 py-3 whitespace-nowrap sticky left-0 bg-inherit">
                      <div className="text-sm font-bold text-zinc-100">{team.teamName}</div>
                      <div className="text-xs text-zinc-400">
                        Капитан: @{team.captain?.nickname || '-'}
                      </div>
                      <div className="text-xs mt-1">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full font-semibold ${
                            team.status === 'completed'
                              ? 'bg-emerald-400/10 text-emerald-300'
                              : team.status === 'in_progress'
                              ? 'bg-sky-400/10 text-sky-300'
                              : team.status === 'abandoned'
                              ? 'bg-rose-400/10 text-rose-300'
                              : 'bg-white/10 text-zinc-300'
                          }`}
                        >
                          {team.status === 'completed'
                            ? 'Завершена'
                            : team.status === 'in_progress'
                            ? 'В процессе'
                            : team.status === 'abandoned'
                            ? 'Прервано'
                            : 'Не начинала'}
                        </span>
                      </div>
                    </td>
                    {Array.from({ length: stepsCount }, (_, i) => {
                      const r = team.taskResults[i];
                      if (!r) {
                        return (
                          <td key={i} className="px-4 py-3 text-center text-sm text-zinc-500">
                            —
                          </td>
                        );
                      }
                      return (
                        <td key={i} className="px-4 py-3 text-xs align-top min-w-[10rem]">
                          <div className="font-semibold text-zinc-100 mb-1">{r.taskTitle}</div>
                          {r.completed && r.isCorrect ? (
                            <>
                              <div className="text-emerald-300">
                                ✓ @{r.submittedBy?.nickname || '?'}
                              </div>
                              <div className="text-zinc-400">{formatMoment(r.completedAt)}</div>
                              <div className="text-zinc-400">
                                ⏱ {formatTime(r.timeSpent)}
                                {r.attempts > 1 && ` · попыток: ${r.attempts}`}
                              </div>
                            </>
                          ) : (
                            <div className="text-zinc-500">не пройдено</div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center text-sm font-bold text-violet-300 bg-primary/10 whitespace-nowrap">
                      {formatTime(team.totalTime)}
                    </td>
                    <td className="px-4 py-3 text-center text-lg font-bold bg-primary/10 whitespace-nowrap">
                      {placeBadge(team.place)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Логи команд - только администратору и организатору игры */}
        {isModerator && (
          <div className="mb-8">
            <button
              onClick={handleToggleLogs}
              className="bg-white/10 hover:bg-white/20 text-zinc-200 border border-white/10 font-bold py-2 px-4 rounded"
            >
              {showLogs ? 'Скрыть логи команд' : '📜 Показать логи команд'}
            </button>

            {showLogs && (
              <div className="mt-4 glass overflow-hidden">
                {logsLoading ? (
                  <div className="p-6 text-center text-zinc-400">Загрузка логов...</div>
                ) : !logs || logs.length === 0 ? (
                  <div className="p-6 text-center text-zinc-400">Логов пока нет</div>
                ) : (
                  <div className="overflow-x-auto max-h-[32rem] overflow-y-auto">
                    <table className="min-w-full divide-y divide-white/10 text-sm">
                      <thead className="bg-[#17112a] sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-zinc-300 uppercase">Время</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-zinc-300 uppercase">Команда</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-zinc-300 uppercase">Участник</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-zinc-300 uppercase">Действие</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-zinc-300 uppercase">Задание</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-zinc-300 uppercase">Ответ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {logs.map((log) => (
                          <tr key={log._id} className="hover:bg-white/5">
                            <td className="px-4 py-2 whitespace-nowrap text-zinc-400">
                              {formatMoment(log.timestamp)}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap font-medium text-zinc-100">
                              {log.team?.name || '-'}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-zinc-400">
                              @{log.user?.nickname || '-'}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap">{actionLabels[log.action]}</td>
                            <td className="px-4 py-2 text-zinc-400">{log.task?.title || '-'}</td>
                            <td className="px-4 py-2 text-zinc-400">{log.answer || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!stats.game.published && !isModerator && (
          <div className="p-6 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <p className="text-amber-200">⏳ Результаты игры еще не опубликованы. Вернитесь позже.</p>
          </div>
        )}
      </div>
    </div>
  );
};
