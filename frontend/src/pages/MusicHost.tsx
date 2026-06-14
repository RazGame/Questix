import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Volume2, Users, ListMusic, ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react';
import { musicService, MusicGameFull } from '../services/music';
import { createSocket } from '../services/socket';
import { MusicState } from '../types';

export default function MusicHost() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [gameData, setGameData] = useState<MusicGameFull | null>(null);
  const [live, setLive] = useState<MusicState | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);

  const loadGameData = useCallback(async () => {
    if (!gameId) return;
    try {
      const data = await musicService.get(gameId);
      setGameData(data);
    } catch {
      setError('Ошибка загрузки информации о песнях');
    }
  }, [gameId]);

  const connectAdmin = useCallback((id: string) => {
    socketRef.current?.disconnect();
    const socket = createSocket(localStorage.getItem('token'));
    socketRef.current = socket;

    socket.on('connect', () => socket.emit('join', { role: 'admin', gameId: id }));
    socket.on('state', (st: MusicState) => setLive(st));
    socket.on('song-updated', () => loadGameData());
    socket.on('error-msg', ({ message }: { message: string }) => setError(message));
  }, [loadGameData]);

  useEffect(() => {
    if (gameId) {
      setIsLoading(true);
      loadGameData()
        .then(() => connectAdmin(gameId))
        .finally(() => setIsLoading(false));
    }
    return () => {
      socketRef.current?.disconnect();
    };
  }, [gameId, loadGameData, connectAdmin]);

  const emit = (evt: string) => socketRef.current?.emit(evt);

  const openVisualizer = () => {
    if (gameId) {
      window.open(`/m/screen/${gameId}`, `screen_${gameId}`, 'width=1280,height=800');
    }
  };

  const goBackToEditor = () => {
    // Возвращаемся в админку, передавая стейт для открытия вкладки музыки
    navigate('/admin', { state: { tab: 'music' } });
  };

  if (isLoading) {
    return <div className="text-center py-20 text-zinc-400">Инициализация пульта ведущего...</div>;
  }

  const currentSongId = live?.reveal
    ? gameData?.songs[live.currentIndex]?._id
    : gameData?.songs[live?.currentIndex || 0]?._id;

  return (
    <div className="max-w-7xl mx-auto p-4 py-8">
      {/* Шапка пульта */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={goBackToEditor}
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/10 transition"
          >
            <ArrowLeft size={16} /> Назад к редактору
          </button>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Пульт: <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">{gameData?.game.title}</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={openVisualizer}
            className="btn-grad flex items-center gap-2 rounded-lg px-4 py-2 font-bold shadow-lg shadow-violet-950/40 text-sm"
          >
            <Volume2 size={16} /> Открыть экран проектора
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-rose-300 flex items-center gap-2">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        {/* Левая колонка: Пульт + Игроки */}
        <div className="space-y-6">
          {/* Код игры для игроков */}
          <div className="glass p-6 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-zinc-500 font-semibold mb-1">Код подключения</p>
              <h2 className="text-4xl font-black text-violet-300 tracking-wider font-mono">
                {gameData?.game.code}
              </h2>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-widest text-zinc-500 font-semibold mb-1">Подключено</p>
              <p className="text-2xl font-bold text-white">
                {live?.players.length || 0} <span className="text-sm font-normal text-zinc-400">игроков</span>
              </p>
            </div>
          </div>

          {/* Пульт управления */}
          {live && (
            <div className="glass p-6 border-violet-500/20 bg-[#17111f]/60">
              <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
                <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                  <Play size={18} className="text-violet-400" />
                  Управление сессией
                </h3>
                {live.total > 0 && (
                  <span className="font-mono text-sm text-zinc-400 bg-white/5 px-2 py-0.5 rounded">
                    Раунд {live.currentIndex + 1} из {live.total}
                  </span>
                )}
              </div>

              {live.phase === 'lobby' && (
                <div className="text-center py-6">
                  <p className="text-zinc-400 mb-6 max-w-md mx-auto">
                    Игра готова. Игроки заходят со своих мобильных устройств по QR-коду или адресу визуализатора и отмечают свою готовность.
                  </p>
                  <button
                    onClick={() => emit('admin:start')}
                    className="btn-grad rounded-xl px-8 py-4 font-bold text-lg shadow-xl hover:scale-[1.02] active:scale-[0.98] transition duration-200"
                  >
                    ▶ Запустить игру
                  </button>
                </div>
              )}

              {live.phase === 'playing' && (
                <div className="py-2">
                  <div className="mb-6 rounded-lg bg-violet-500/5 border border-violet-500/10 p-4">
                    <p className="text-xs uppercase text-zinc-400 font-semibold tracking-wider mb-2">Сейчас играет</p>
                    <p className="text-lg font-bold text-zinc-100">{live.blockName || 'Без названия блока'}</p>
                    <p className="text-sm text-zinc-400">Музыка звучит на экране проектора. Ожидаем нажатия кнопки игроками...</p>
                  </div>
                  <button
                    onClick={() => emit('admin:skip')}
                    className="rounded-lg bg-amber-600 hover:bg-amber-500 px-5 py-2.5 font-bold text-white transition flex items-center gap-2"
                  >
                    Пропустить эту песню ⏭
                  </button>
                </div>
              )}

              {live.phase === 'buzzed' && (
                <div className="py-2">
                  <p className="text-xs uppercase text-zinc-400 font-semibold tracking-wider mb-1">Игрок нажал кнопку</p>
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-6 text-center my-4 animate-pulse">
                    <p className="font-display text-4xl font-extrabold text-amber-300">
                      🔔 {live.buzzed?.name}
                    </p>
                  </div>
                  <p className="text-sm text-zinc-400 mb-6">Музыка приостановлена. Выслушайте ответ игрока и отметьте результат:</p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => emit('admin:correct')}
                      className="flex-1 min-w-[120px] rounded-lg bg-emerald-600 hover:bg-emerald-500 py-3 font-bold text-white transition flex items-center justify-center gap-1"
                    >
                      ✓ Правильно
                    </button>
                    <button
                      onClick={() => emit('admin:wrong')}
                      className="flex-1 min-w-[120px] rounded-lg bg-rose-600 hover:bg-rose-500 py-3 font-bold text-white transition flex items-center justify-center gap-1"
                    >
                      ✕ Неправильно
                    </button>
                    <button
                      onClick={() => emit('admin:skip')}
                      className="rounded-lg bg-zinc-700 hover:bg-zinc-600 px-5 py-3 font-bold text-white transition"
                      title="Пропустить песню"
                    >
                      Пропустить
                    </button>
                  </div>
                </div>
              )}

              {live.phase === 'reveal' && (
                <div className="py-4 text-center">
                  <p className="text-xs uppercase text-zinc-500 font-semibold tracking-wider mb-2">Правильный ответ</p>
                  {live.reveal && (
                    <div className="mb-4 inline-flex items-center gap-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-left">
                      {live.reveal.cover && (
                        <img src={live.reveal.cover} alt="Cover" className="w-16 h-16 rounded-lg object-cover" />
                      )}
                      <div>
                        <p className="text-xl font-bold text-emerald-300">{live.reveal.title}</p>
                        <p className="text-zinc-400">{live.reveal.artist}</p>
                      </div>
                    </div>
                  )}
                  <p className="text-sm text-zinc-400">Трек доигрывается. Переход к следующему раунду произойдет автоматически.</p>
                </div>
              )}

              {live.phase === 'finished' && (
                <div className="text-center py-6">
                  <p className="text-2xl font-bold text-emerald-400 mb-2">🏆 Игра окончена!</p>
                  <p className="text-zinc-400 mb-6">Все треки сыграны. Итоговая таблица лидеров отображается на экране.</p>
                  <button
                    onClick={() => emit('admin:reset')}
                    className="flex items-center gap-2 rounded-xl bg-white/10 px-6 py-3 font-bold text-white hover:bg-white/20 mx-auto transition"
                  >
                    <RefreshCw size={16} /> Сбросить сессию и играть заново
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Таблица игроков */}
          <div className="glass p-6">
            <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2 mb-4">
              <Users size={18} className="text-violet-400" />
              Участники ({live?.players.length || 0})
            </h3>
            {live?.players && live.players.length > 0 ? (
              <div className="grid gap-2">
                {[...live.players].sort((a, b) => b.score - a.score).map((p, index) => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between rounded-lg px-4 py-3 bg-white/[0.02] border border-white/5 transition ${
                      !p.connected ? 'opacity-40' : ''
                    } ${p.ready ? 'ring-1 ring-emerald-400/30 bg-emerald-500/[0.01]' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-sm font-bold text-zinc-500">#{index + 1}</span>
                      <span className={`font-semibold ${p.connected ? 'text-zinc-100' : 'text-zinc-500'}`}>
                        {p.name}
                      </span>
                      {!p.connected && (
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider bg-white/5 px-1.5 py-0.5 rounded">
                          оффлайн
                        </span>
                      )}
                      {p.locked && (
                        <span className="text-[10px] text-rose-300 uppercase tracking-wider bg-rose-500/10 px-1.5 py-0.5 rounded">
                          заблокирован
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {p.ready && (
                        <span className="text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          готов
                        </span>
                      )}
                      <span className="font-bold text-lg text-violet-300">{p.score} очков</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-zinc-500 text-sm text-center py-6">Пока никто не подключился.</p>
            )}
          </div>
        </div>

        {/* Правая колонка: Плейлист / Песни */}
        <div className="glass p-6 flex flex-col max-h-[calc(100vh-12rem)] overflow-hidden">
          <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
            <ListMusic size={18} className="text-violet-400" />
            Плейлист игры
          </h3>
          <div className="flex-1 overflow-y-auto pr-1 space-y-4">
            {gameData?.game.blocks.map((block) => (
              <div key={block._id} className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{block.name}</h4>
                <div className="space-y-1">
                  {block.songIds.map((songId) => {
                    const song = gameData.songs.find((s) => s._id === songId);
                    if (!song) return null;

                    const isPlaying = currentSongId === song._id;

                    return (
                      <div
                        key={song._id}
                        className={`flex items-center gap-3 rounded-lg p-2.5 transition border ${
                          isPlaying
                            ? 'bg-primary/10 border-primary/40 text-white'
                            : 'bg-white/[0.01] border-transparent text-zinc-400 hover:bg-white/[0.03]'
                        }`}
                      >
                        {song.cover ? (
                          <img src={song.cover} alt="" className="w-8 h-8 rounded object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center font-bold">
                            🎵
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-semibold truncate ${isPlaying ? 'text-violet-300' : 'text-zinc-200'}`}>
                            {song.title}
                          </p>
                          <p className="text-[10px] text-zinc-400 truncate">{song.artist}</p>
                        </div>
                        {isPlaying && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300 bg-violet-400/20 px-1.5 py-0.5 rounded animate-pulse">
                            играет
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
