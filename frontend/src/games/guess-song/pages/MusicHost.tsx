import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Pause, Volume2, Users, ListMusic, ArrowLeft, RefreshCw, AlertCircle, Send, Eye, Trash2, UserMinus, Square } from 'lucide-react';
import { musicCoverSrc, musicService, MusicGameFull } from '../services/music';
import { createSocket } from '../services/socket';
import SongCover from '../components/SongCover';
import { partyResultsService } from '../../../core/services/results';
import { MusicState } from '../../../core/types';

export default function MusicHost() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [gameData, setGameData] = useState<MusicGameFull | null>(null);
  const [live, setLive] = useState<MusicState | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sendingResults, setSendingResults] = useState(false);
  const [sendNotice, setSendNotice] = useState('');
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);

  // Отправка всех неотправленных итогов станции в облако Questix.
  const sendResults = async () => {
    setSendingResults(true);
    setSendNotice('');
    try {
      const s = await partyResultsService.send();
      if (s.sent === 0 && s.failed === 0 && s.pending === 0) {
        setSendNotice('Облако не настроено (QUESTIX_CLOUD_URL) — итоги сохранены локально.');
      } else if (s.failed > 0) {
        setError(`Отправлено ${s.sent}, не удалось ${s.failed}. Попробуйте позже — итоги не потеряются.`);
      } else {
        setSendNotice(`Отправлено в Questix: ${s.sent}. Неотправленных не осталось.`);
      }
    } catch (e: any) {
      setError(e.response?.data?.error || 'Не удалось отправить результаты');
    } finally {
      setSendingResults(false);
    }
  };

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

  const emit = (evt: string, payload?: unknown) => socketRef.current?.emit(evt, payload);

  const openVisualizer = () => {
    if (gameId) {
      window.open(`/m/screen/${gameId}`, `screen_${gameId}`, 'width=1280,height=800');
    }
  };

  const goBackToEditor = () => {
    // Возвращаемся в админку, передавая стейт для открытия вкладки музыки
    navigate('/admin?tab=music');
  };

  if (isLoading) {
    return <div className="text-center py-20 text-zinc-400">Инициализация пульта ведущего...</div>;
  }

  // id текущей песни приходит с сервера — индекс плейлиста нельзя применять
  // к gameData.songs (порядок в БД может отличаться от порядка блоков).
  const currentSongId = live?.currentSongId;
  const currentSong = gameData?.songs.find((s) => s._id === currentSongId);
  const displayRound =
    live && live.total > 0
      ? Math.min(Math.max(live.currentIndex + 1, 1), live.total)
      : 0;

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
                <div className="flex items-center gap-3">
                  {live.total > 0 && (
                    <span className="font-mono text-sm text-zinc-400 bg-white/5 px-2 py-0.5 rounded">
                      Раунд {displayRound} из {live.total}
                    </span>
                  )}
                  {/* Остановка возвращает игру в лобби: счёт сбрасывается,
                      игроки остаются подключёнными и можно начать заново. */}
                  {live.phase !== 'lobby' && (
                    <button
                      onClick={() => {
                        if (confirm('Остановить игру и вернуться в лобби? Счёт будет сброшен.')) emit('admin:reset');
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-sm font-bold text-rose-300 transition hover:bg-rose-500/20"
                    >
                      <Square size={13} /> Остановить
                    </button>
                  )}
                  {/* Кнопка на месте во всех игровых фазах: она то появлялась,
                      то исчезала, и панель дёргалась под курсором. */}
                  {live.phase !== 'lobby' && live.phase !== 'finished' && (
                    live.paused ? (
                      <button
                        onClick={() => emit('admin:resume')}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-sm font-bold text-white transition"
                      >
                        <Play size={14} /> Продолжить
                      </button>
                    ) : (
                      <button
                        onClick={() => emit('admin:pause')}
                        className="flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 px-4 py-1.5 text-sm font-bold text-white transition"
                      >
                        <Pause size={14} /> Пауза
                      </button>
                    )
                  )}
                </div>
              </div>

              {live.paused && (
                <div className="mb-6 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-amber-200 flex items-center gap-2">
                  <Pause size={16} />
                  <span>Игра на паузе. Баззеры и таймеры остановлены — нажмите «Продолжить», чтобы вернуться в игру.</span>
                </div>
              )}

              {(live.phase === 'intro' || live.phase === 'blockIntro') && (
                <div className="py-2">
                  <div className="mb-6 rounded-lg bg-violet-500/5 border border-violet-500/10 p-4">
                    <p className="text-xs uppercase text-zinc-400 font-semibold tracking-wider mb-2">
                      {live.phase === 'intro' ? 'Показываем блоки игры' : 'Анонс нового блока'}
                    </p>
                    <p className="text-lg font-bold text-zinc-100">{live.blockName || 'Без названия блока'}</p>
                    <p className="text-sm text-zinc-400">
                      На экране проектора {live.phase === 'intro' ? 'список всех блоков игры' : 'название нового блока'}.
                      Песня включится автоматически, или запустите её сразу.
                    </p>
                  </div>
                  <button
                    onClick={() => emit('admin:continue')}
                    disabled={live.paused}
                    className={`rounded-lg px-5 py-2.5 font-bold text-white transition flex items-center gap-2 ${
                      live.paused ? 'cursor-not-allowed bg-white/10 text-zinc-500' : 'btn-grad'
                    }`}
                  >
                    ▶ Запустить песню сейчас
                  </button>
                </div>
              )}

              {live.phase === 'lobby' && (
                <div className="text-center py-6">
                  <p className="text-zinc-400 mb-6 max-w-md mx-auto">
                    Игра готова. Игроки заходят со своих мобильных устройств по QR-коду или адресу визуализатора и отмечают свою готовность.
                  </p>
                  <button
                    onClick={() => emit('admin:start')}
                    disabled={!live.screenReady}
                    className={`rounded-xl px-8 py-4 font-bold text-lg shadow-xl transition duration-200 ${
                      live.screenReady
                        ? 'btn-grad hover:scale-[1.02] active:scale-[0.98]'
                        : 'cursor-not-allowed bg-white/10 text-zinc-500 shadow-none'
                    }`}
                  >
                    ▶ Запустить игру
                  </button>
                  {!live.screenReady && (
                    <p className="mt-3 text-sm text-amber-300">
                      Сначала нажмите «включить звук» на экране проектора.
                    </p>
                  )}
                </div>
              )}

              {live.phase === 'playing' && (
                <div className="py-2">
                  <div className="mb-6 rounded-lg bg-violet-500/5 border border-violet-500/10 p-4">
                    <p className="text-xs uppercase text-zinc-400 font-semibold tracking-wider mb-2">Сейчас играет</p>
                    <div className="flex items-center gap-3">
                      {currentSong?.cover && (
                        <SongCover cover={currentSong.cover} songId={currentSong._id} className="w-12 h-12 rounded-lg object-cover shadow" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-lg font-bold text-zinc-100">
                          {currentSong ? `${currentSong.title} — ${currentSong.artist}` : (live.blockName || 'Без названия блока')}
                        </p>
                        <p className="truncate text-xs text-zinc-500">{live.blockName || ''}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-zinc-400">
                      {live.anyArmed === false
                        ? 'Все игроки уже ответили неверно — нажать баззер больше некому.'
                        : 'Музыка звучит на экране проектора. Ожидаем нажатия кнопки игроками...'}
                    </p>
                    {currentSong?.note && (
                      <p className="mt-2 text-sm text-amber-200/90">
                        <span className="font-bold uppercase text-[10px] tracking-wider text-amber-400/80">
                          подсказка:{' '}
                        </span>
                        {currentSong.note}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {/* Никто не может ответить — предлагаем раскрыть ответ первым делом */}
                    <button
                      onClick={() => emit('admin:reveal')}
                      disabled={live.paused}
                      className={`rounded-lg px-5 py-2.5 font-bold text-white transition flex items-center gap-2 ${
                        live.paused
                          ? 'cursor-not-allowed bg-white/10 text-zinc-500'
                          : live.anyArmed === false
                            ? 'btn-grad'
                            : 'bg-white/10 hover:bg-white/20'
                      }`}
                      title="Доиграть отрывок, показать исполнителя на экране и перейти к следующей песне"
                    >
                      <Eye size={16} /> Никто не угадал
                    </button>
                    <button
                      onClick={() => emit('admin:skip')}
                      disabled={live.paused}
                      className={`rounded-lg px-5 py-2.5 font-bold text-white transition flex items-center gap-2 ${
                        live.paused ? 'cursor-not-allowed bg-white/10 text-zinc-500' : 'bg-amber-600 hover:bg-amber-500'
                      }`}
                      title="Молча перейти к следующей песне — ответ не показывается"
                    >
                      Пропустить ⏭
                    </button>
                  </div>
                </div>
              )}

              {live.phase === 'ended' && (
                <div className="py-2">
                  <div className="mb-6 rounded-lg bg-amber-500/5 border border-amber-500/15 p-4">
                    <p className="text-xs uppercase text-zinc-400 font-semibold tracking-wider mb-2">Фрагмент закончился</p>
                    <div className="flex items-center gap-3">
                      {currentSong?.cover && (
                        <SongCover cover={currentSong.cover} songId={currentSong._id} className="w-12 h-12 rounded-lg object-cover shadow" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-lg font-bold text-zinc-100">
                          {currentSong ? `${currentSong.title} — ${currentSong.artist}` : (live.blockName || 'Без названия блока')}
                        </p>
                        <p className="truncate text-xs text-zinc-500">{live.blockName || ''}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-zinc-400">
                      {live.anyArmed === false
                        ? 'Никто не угадал — покажите ответ или дайте послушать ещё раз.'
                        : 'Можно включить этот же кусок ещё раз или перейти к следующей песне.'}
                    </p>
                    {currentSong?.note && (
                      <p className="mt-2 text-sm text-amber-200/90">
                        <span className="font-bold uppercase text-[10px] tracking-wider text-amber-400/80">
                          подсказка:{' '}
                        </span>
                        {currentSong.note}
                      </p>
                    )}
                  </div>
                  {/* Сетка вместо flex-wrap: четыре кнопки складывались 3+1 и
                      выглядели неровно на широком экране. */}
                  {/* Порядок по ходу мысли ведущего: сперва «переиграть»,
                      потом переходы. «Никто не угадал» — завершающее действие,
                      поэтому последняя и оранжевая. */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <button
                      onClick={() => emit('admin:replay')}
                      className="btn-grad flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-bold text-white transition"
                    >
                      <RefreshCw size={16} /> Включить ещё раз
                    </button>
                    <button
                      onClick={() => emit('admin:playon')}
                      disabled={live.paused}
                      className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-bold text-white transition ${
                        live.paused ? 'cursor-not-allowed bg-white/10 text-zinc-500' : 'bg-emerald-600 hover:bg-emerald-500'
                      }`}
                      title="Продолжить песню с места остановки, без ограничения отрезка"
                    >
                      <Play size={16} /> Доиграть дальше
                    </button>
                    <button
                      onClick={() => emit('admin:skip')}
                      className="flex items-center justify-center gap-2 rounded-lg bg-white/10 px-4 py-2.5 font-bold text-zinc-200 transition hover:bg-white/20"
                      title="Молча перейти к следующей песне — ответ не показывается"
                    >
                      Следующая песня ⏭
                    </button>
                    <button
                      onClick={() => emit('admin:reveal')}
                      disabled={live.paused}
                      className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-bold text-white transition ${
                        live.paused ? 'cursor-not-allowed bg-white/10 text-zinc-500' : 'bg-amber-600 hover:bg-amber-500'
                      }`}
                      title="Доиграть отрывок, показать исполнителя на экране и перейти к следующей песне"
                    >
                      <Eye size={16} /> Никто не угадал
                    </button>
                  </div>
                </div>
              )}

              {live.phase === 'buzzed' && (
                <div className="py-2">
                  <p className="text-xs uppercase text-zinc-400 font-semibold tracking-wider mb-1">Игрок нажал кнопку</p>
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-6 text-center my-4 animate-pulse">
                    <p className="font-display text-4xl font-extrabold text-amber-300">
                      🔔 {live.buzzed?.name}
                    </p>
                    {live.mode === 'team' && live.buzzed?.by && (
                      <p className="mt-1 text-sm font-semibold text-amber-200/80">отвечает {live.buzzed.by}</p>
                    )}
                  </div>
                  {currentSong && (
                    <div className="mb-4 flex items-center gap-3 rounded-lg border border-emerald-500/15 bg-emerald-500/5 p-3">
                      {currentSong.cover && (
                        <SongCover cover={currentSong.cover} songId={currentSong._id} size="sm" className="w-10 h-10 rounded object-cover" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-emerald-400/80 font-semibold">Правильный ответ</p>
                        <p className="truncate text-sm font-bold text-emerald-200">
                          {currentSong.title} — {currentSong.artist}
                        </p>
                      </div>
                    </div>
                  )}
                  {currentSong?.note && (
                    <div className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80">
                        Подсказка ведущему
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-amber-100">{currentSong.note}</p>
                    </div>
                  )}
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
                        <img src={musicCoverSrc(live.reveal.cover)} alt="Cover" className="w-16 h-16 rounded-lg object-cover" />
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
                  <div className="flex flex-wrap justify-center gap-3">
                    {/* Итоги уже сохранены на станции; кнопка шлёт их в облако Questix */}
                    <button
                      onClick={sendResults}
                      disabled={sendingResults}
                      className="btn-grad flex items-center gap-2 rounded-xl px-6 py-3 font-bold transition disabled:opacity-50"
                    >
                      <Send size={16} /> {sendingResults ? 'Отправляем…' : 'Отправить результаты в Questix'}
                    </button>
                    <button
                      onClick={() => emit('admin:reset')}
                      className="flex items-center gap-2 rounded-xl bg-white/10 px-6 py-3 font-bold text-white hover:bg-white/20 transition"
                    >
                      <RefreshCw size={16} /> Сбросить сессию и играть заново
                    </button>
                  </div>
                  {sendNotice && (
                    <p className="mt-4 text-sm text-emerald-300">{sendNotice}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Участники: в командном режиме — команда, а внутри неё игроки.
              Плоский список рядом с таблицей команд заставлял глазами сшивать
              одно с другим. Длинные названия обрезаем — они ломали вёрстку. */}
          {live?.mode === 'team' ? (
            <div className="glass p-6">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-zinc-100">
                <Users size={18} className="text-violet-400" />
                Команды ({live.teams?.length || 0})
              </h3>
              {live.teams && live.teams.length > 0 ? (
                <div className="grid gap-3">
                  {[...live.teams].sort((a, b) => b.score - a.score).map((t, index) => {
                    const members = live.players.filter((p) => p.teamId === t.id);
                    return (
                      <div
                        key={t.id}
                        className={`rounded-lg border border-white/5 bg-white/[0.02] ${
                          t.locked ? 'opacity-60' : ''
                        } ${t.ready > 0 ? 'ring-1 ring-emerald-400/30' : ''}`}
                      >
                        <div className="flex items-center gap-3 px-4 py-3">
                          <span className="w-5 shrink-0 text-sm font-bold text-zinc-500">#{index + 1}</span>
                          <span className="min-w-0 flex-1 truncate font-semibold text-zinc-100" title={t.name}>
                            👥 {t.name}
                          </span>
                          {t.locked && (
                            <span className="shrink-0 rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-rose-300">
                              заблокирована
                            </span>
                          )}
                          <span className="shrink-0 text-lg font-bold text-violet-300">{t.score}</span>
                          <button
                            onClick={() => {
                              if (confirm(`Убрать команду «${t.name}» вместе с участниками?`)) {
                                emit('admin:remove-team', { teamId: t.id });
                              }
                            }}
                            className="shrink-0 rounded p-1 text-zinc-500 transition hover:bg-rose-500/10 hover:text-rose-300"
                            title="Убрать команду"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <div className="border-t border-white/5 px-4 py-2">
                          {members.length === 0 ? (
                            <p className="py-1 text-xs text-zinc-600">Никого не осталось</p>
                          ) : members.map((p) => (
                            <div key={p.id} className="flex items-center gap-2 py-1">
                              <span className={`min-w-0 flex-1 truncate text-sm ${p.connected ? 'text-zinc-300' : 'text-zinc-600'}`} title={p.name}>
                                {p.name}
                              </span>
                              {!p.connected && <span className="shrink-0 text-[10px] uppercase text-zinc-600">оффлайн</span>}
                              {p.ready && <span className="shrink-0 text-[10px] uppercase text-emerald-400">готов</span>}
                              <button
                                onClick={() => emit('admin:kick', { playerId: p.id })}
                                className="shrink-0 rounded p-0.5 text-zinc-600 transition hover:bg-rose-500/10 hover:text-rose-300"
                                title="Отключить игрока"
                              >
                                <UserMinus size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-zinc-500">Пока ни одна команда не подключилась.</p>
              )}
            </div>
          ) : (
            <div className="glass p-6">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-zinc-100">
                <Users size={18} className="text-violet-400" />
                Участники ({live?.players.length || 0})
              </h3>
              {live?.players && live.players.length > 0 ? (
                <div className="grid gap-2">
                  {[...live.players].sort((a, b) => b.score - a.score).map((p, index) => (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3 ${
                        !p.connected ? 'opacity-40' : ''
                      } ${p.ready ? 'ring-1 ring-emerald-400/30' : ''}`}
                    >
                      <span className="w-5 shrink-0 text-sm font-bold text-zinc-500">#{index + 1}</span>
                      <span className={`min-w-0 flex-1 truncate font-semibold ${p.connected ? 'text-zinc-100' : 'text-zinc-500'}`} title={p.name}>
                        {p.name}
                      </span>
                      {!p.connected && <span className="shrink-0 text-[10px] uppercase text-zinc-500">оффлайн</span>}
                      {p.locked && <span className="shrink-0 text-[10px] uppercase text-rose-300">заблокирован</span>}
                      {p.ready && <span className="shrink-0 text-xs font-semibold text-emerald-400">готов</span>}
                      <span className="shrink-0 text-lg font-bold text-violet-300">{p.score}</span>
                      <button
                        onClick={() => emit('admin:kick', { playerId: p.id })}
                        className="shrink-0 rounded p-1 text-zinc-600 transition hover:bg-rose-500/10 hover:text-rose-300"
                        title="Отключить игрока"
                      >
                        <UserMinus size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-zinc-500">Пока никто не подключился.</p>
              )}
            </div>
          )}
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
                          <SongCover cover={song.cover} songId={song._id} size="sm" className="w-8 h-8 rounded object-cover" />
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
