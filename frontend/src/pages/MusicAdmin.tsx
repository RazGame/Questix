import { useEffect, useRef, useState, useCallback } from 'react';
import { Plus, Play, Trash2, Upload, RefreshCw, Search, RotateCw, Scissors } from 'lucide-react';
import { musicService, MusicGameFull, SongSearchResult } from '../services/music';
import { createSocket } from '../services/socket';
import { MusicGame, Song, MusicState } from '../types';
import MusicSegmentModal from './MusicSegmentModal';

const fmtTime = (s: number) => {
  s = Math.max(0, Math.round(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const statusLabels: Record<Song['status'], string> = {
  ready: 'готово',
  pending: 'ожидает',
  downloading: 'качаю…',
  error: 'ошибка',
};
const statusTone: Record<Song['status'], string> = {
  ready: 'bg-emerald-400/10 text-emerald-300',
  pending: 'bg-white/10 text-zinc-400',
  downloading: 'bg-sky-400/10 text-sky-300',
  error: 'bg-rose-400/10 text-rose-300',
};

export default function MusicAdmin() {
  const [games, setGames] = useState<(MusicGame & { songCount: number })[]>([]);
  const [current, setCurrent] = useState<MusicGameFull | null>(null);
  const [error, setError] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [results, setResults] = useState<SongSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [targetBlock, setTargetBlock] = useState('');
  const [live, setLive] = useState<MusicState | null>(null);
  const [spotiVersion, setSpotiVersion] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({}); // прогресс загрузки по songId
  const [segmentSong, setSegmentSong] = useState<Song | null>(null); // открытая модалка отрезка
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);

  const loadGames = useCallback(async () => {
    try { setGames(await musicService.list()); } catch { setError('Ошибка загрузки игр'); }
  }, []);

  useEffect(() => { loadGames(); }, [loadGames]);
  useEffect(() => {
    musicService.spotiflacVersion().then((v) => setSpotiVersion(v.version)).catch(() => {});
  }, []);

  const selectGame = async (id: string) => {
    try {
      const full = await musicService.get(id);
      setCurrent(full);
      setTargetBlock(full.game.blocks[0]?._id || '');
      connectAdmin(id);
    } catch {
      setError('Ошибка загрузки игры');
    }
  };

  const refreshCurrent = async () => {
    if (current) {
      const full = await musicService.get(current.game._id);
      setCurrent(full);
    }
    loadGames();
  };

  // --- сокет ведущего ---
  const connectAdmin = (gameId: string) => {
    socketRef.current?.disconnect();
    const socket = createSocket(localStorage.getItem('token'));
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('join', { role: 'admin', gameId }));
    socket.on('state', (st: MusicState) => setLive(st));
    socket.on('song-progress', ({ songId, progress: p }: { songId: string; progress: number }) =>
      setProgress((prev) => ({ ...prev, [songId]: p }))
    );
    socket.on('song-updated', ({ song }: { song?: Song }) => {
      // обновляем одну песню точечно; на ready чистим прогресс
      if (song?._id) {
        setProgress((prev) => {
          const next = { ...prev };
          if (song.status !== 'downloading') delete next[song._id];
          return next;
        });
      }
      refreshCurrent();
    });
    socket.on('error-msg', ({ message }: { message: string }) => setError(message));
  };
  useEffect(() => () => { socketRef.current?.disconnect(); }, []);

  const emit = (evt: string) => socketRef.current?.emit(evt);

  // --- игры ---
  const createGame = async () => {
    const g = await musicService.create('Новая музыкальная игра');
    await loadGames();
    selectGame(g._id);
  };
  const deleteGame = async () => {
    if (!current || !confirm(`Удалить игру «${current.game.title}»?`)) return;
    await musicService.remove(current.game._id);
    setCurrent(null);
    setLive(null);
    loadGames();
  };
  const renameGame = async (title: string) => {
    if (!current) return;
    setCurrent({ ...current, game: { ...current.game, title } });
    await musicService.update(current.game._id, title);
    loadGames();
  };

  // --- блоки ---
  const addBlock = async () => {
    if (!current) return;
    await musicService.addBlock(current.game._id);
    refreshCurrent();
  };
  const renameBlock = async (blockId: string, name: string) => {
    if (!current) return;
    await musicService.updateBlock(current.game._id, blockId, name);
  };
  const removeBlock = async (blockId: string) => {
    if (!current || !confirm('Удалить блок со всеми песнями?')) return;
    await musicService.removeBlock(current.game._id, blockId);
    refreshCurrent();
  };

  // --- песни ---
  const removeSong = async (songId: string) => {
    if (!current) return;
    await musicService.removeSong(current.game._id, songId);
    refreshCurrent();
  };
  const uploadFile = (songId: string) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'audio/*,.flac,.mp3,.m4a,.ogg,.wav';
    inp.onchange = async () => {
      if (inp.files?.[0] && current) {
        await musicService.uploadSongFile(current.game._id, songId, inp.files[0]);
        refreshCurrent();
      }
    };
    inp.click();
  };
  const addOwnFile = (blockId: string) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'audio/*,.flac,.mp3,.m4a,.ogg,.wav';
    inp.onchange = async () => {
      if (inp.files?.[0] && current) {
        const f = inp.files[0];
        const song = await musicService.addSong(current.game._id, blockId, {
          title: f.name.replace(/\.[^.]+$/, ''),
          artist: '',
        });
        await musicService.uploadSongFile(current.game._id, song._id, f);
        refreshCurrent();
      }
    };
    inp.click();
  };

  // --- поиск ---
  const doSearch = async () => {
    if (!searchQ.trim()) return;
    setSearching(true);
    setResults([]);
    try { setResults(await musicService.search(searchQ.trim())); }
    catch (e: any) { setError(e.response?.data?.error || 'Поиск недоступен'); }
    finally { setSearching(false); }
  };
  const addResult = async (r: SongSearchResult) => {
    if (!current || !targetBlock) return;
    await musicService.addSong(current.game._id, targetBlock, r);
    refreshCurrent();
  };

  const updateSpotiflac = async () => {
    setSpotiVersion('обновление…');
    try { setSpotiVersion((await musicService.spotiflacUpdate()).version); }
    catch { setError('Не удалось обновить SpotiFLAC'); setSpotiVersion(null); }
  };

  const songById = (id: string) => current?.songs.find((s) => s._id === id);

  return (
    <div className="max-w-7xl mx-auto p-4 py-8">
      <p className="tech-label mb-2">[ угадай мелодию ]</p>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-4xl font-bold">Музыкальные игры</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            SpotiFLAC: {spotiVersion || '—'}
          </span>
          <button
            onClick={updateSpotiflac}
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-200 hover:bg-white/10"
            title="Обновить SpotiFLAC до новой версии"
          >
            <RefreshCw size={15} /> Обновить
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border border-rose-500/20 bg-rose-500/10 p-3 text-rose-300">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(18rem,22rem)_1fr]">
        {/* список игр */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Игры</h2>
            <button onClick={createGame} className="btn-grad p-2 rounded">
              <Plus size={20} />
            </button>
          </div>
          <div className="space-y-2 max-h-[32rem] overflow-y-auto">
            {games.map((g) => (
              <div
                key={g._id}
                onClick={() => selectGame(g._id)}
                className={`p-3 rounded cursor-pointer transition ${
                  current?.game._id === g._id ? 'bg-primary text-white' : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                <p className="font-bold">{g.title}</p>
                <p className="text-sm opacity-75">код {g.code} · песен: {g.songCount}</p>
              </div>
            ))}
            {games.length === 0 && <p className="text-zinc-500 text-sm">Пока нет музыкальных игр.</p>}
          </div>
        </div>

        {/* редактор */}
        <div>
          {!current ? (
            <p className="text-zinc-400 text-center">Выберите или создайте игру</p>
          ) : (
            <div className="space-y-6">
              {/* шапка */}
              <div className="glass p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <input
                    value={current.game.title}
                    onChange={(e) => renameGame(e.target.value)}
                    className="input-dark text-lg font-bold max-w-sm"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-400">код <b className="text-violet-300 tracking-widest">{current.game.code}</b></span>
                    <button
                      onClick={() => window.open(`/m/screen/${current.game._id}`, `screen_${current.game._id}`, 'width=1280,height=800')}
                      className="btn-grad flex items-center gap-1 rounded-lg px-4 py-2 font-bold"
                    >
                      <Play size={17} /> Играть
                    </button>
                    <button onClick={deleteGame} className="text-rose-400 hover:text-rose-300 p-2" title="Удалить игру">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {/* пульт ведущего */}
              {live && <LiveControl live={live} emit={emit} />}

              {/* поиск песен */}
              <div className="glass p-5">
                <div className="flex gap-2 mb-3">
                  <input
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                    placeholder="Поиск песни…"
                    className="input-dark flex-1"
                  />
                  <select value={targetBlock} onChange={(e) => setTargetBlock(e.target.value)} className="input-dark w-40 text-sm">
                    {current.game.blocks.map((b) => (
                      <option key={b._id} value={b._id}>{b.name}</option>
                    ))}
                  </select>
                  <button onClick={doSearch} className="btn-grad flex items-center gap-1 rounded-lg px-4 font-bold">
                    <Search size={17} /> Найти
                  </button>
                </div>
                {searching && <p className="text-zinc-500 text-sm">Поиск…</p>}
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {results.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-2">
                      {r.cover && <img src={r.cover} alt="" className="w-10 h-10 rounded" />}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{r.title}</div>
                        <div className="truncate text-xs text-zinc-400">{r.artist} · {fmtTime(r.duration || 0)}</div>
                      </div>
                      <button onClick={() => addResult(r)} className="btn-grad rounded-lg px-3 py-1.5 text-xs font-bold">
                        + добавить
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* блоки и песни */}
              <div className="glass p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold">Блоки</h3>
                  <button onClick={addBlock} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-bold text-zinc-200 hover:bg-white/20">
                    + блок
                  </button>
                </div>
                <div className="space-y-5">
                  {current.game.blocks.map((b) => (
                    <div key={b._id} className="rounded-lg border border-white/10 p-3">
                      <div className="flex items-center gap-2 mb-3">
                        <input
                          defaultValue={b.name}
                          onBlur={(e) => renameBlock(b._id, e.target.value)}
                          className="input-dark flex-1 text-sm font-semibold"
                        />
                        <button onClick={() => addOwnFile(b._id)} className="rounded-lg bg-white/10 px-2 py-1.5 text-xs text-zinc-200 hover:bg-white/20" title="Добавить своим файлом">
                          📁 свой
                        </button>
                        <button onClick={() => removeBlock(b._id)} className="text-rose-400 hover:text-rose-300 p-1" title="Удалить блок">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="space-y-2">
                        {b.songIds.length === 0 && <p className="text-zinc-500 text-xs">Добавьте песни через поиск выше.</p>}
                        {b.songIds.map((sid) => {
                          const s = songById(sid);
                          if (!s) return null;
                          const seg = s.endSec
                            ? `${fmtTime(s.startSec)}–${fmtTime(s.endSec)}`
                            : `с ${fmtTime(s.startSec)}`;
                          return (
                            <div key={s._id} className="rounded-lg bg-white/[0.03] p-2">
                              <div className="flex items-center gap-3">
                                {s.cover && <img src={s.cover} alt="" className="w-9 h-9 rounded" />}
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-semibold">{s.title}</div>
                                  <div className="truncate text-xs text-zinc-400">{s.artist}</div>
                                </div>
                                <span className={`rounded-full px-2 py-0.5 text-xs ${statusTone[s.status]}`} title={s.error || ''}>
                                  {statusLabels[s.status]}
                                </span>
                                {s.status === 'ready' && s.file && (
                                  <button
                                    onClick={() => setSegmentSong(s)}
                                    className="flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs text-zinc-200 hover:bg-white/20"
                                    title="Выбрать отрезок песни"
                                  >
                                    <Scissors size={14} /> {seg}
                                  </button>
                                )}
                                {s.sourceUrl && (s.status === 'error' || s.status === 'pending') && (
                                  <button
                                    onClick={() => musicService.downloadSong(current.game._id, s._id)}
                                    className="text-zinc-400 hover:text-white p-1"
                                    title="Повторить авто-загрузку"
                                  >
                                    <RotateCw size={15} />
                                  </button>
                                )}
                                <button onClick={() => uploadFile(s._id)} className="text-zinc-400 hover:text-white p-1" title="Загрузить файл">
                                  <Upload size={15} />
                                </button>
                                <button onClick={() => removeSong(s._id)} className="text-rose-400 hover:text-rose-300 p-1" title="Убрать песню">
                                  <Trash2 size={15} />
                                </button>
                              </div>
                              {s.status === 'downloading' && (
                                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-300"
                                    style={{ width: `${progress[s._id] || 5}%` }}
                                  />
                                </div>
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
          )}
        </div>
      </div>

      {segmentSong && current && (
        <MusicSegmentModal
          gameId={current.game._id}
          song={segmentSong}
          onClose={() => setSegmentSong(null)}
          onSaved={() => refreshCurrent()}
        />
      )}
    </div>
  );
}

// Пульт ведущего: lobby/playing/buzzed/reveal/finished.
function LiveControl({ live, emit }: { live: MusicState; emit: (e: string) => void }) {
  const progress = live.total ? `Песня ${live.currentIndex + 1} из ${live.total}` : '';
  return (
    <div className="glass p-5">
      <h3 className="text-xl font-bold mb-3">Пульт ведущего</h3>
      {live.phase === 'lobby' && (
        <>
          <p className="text-zinc-400 mb-3">Лобби. Игроки подключаются и жмут «Готов».</p>
          <button onClick={() => emit('admin:start')} className="btn-grad rounded-lg px-6 py-3 font-bold text-lg">
            ▶ Запустить игру
          </button>
        </>
      )}
      {live.phase === 'playing' && (
        <>
          <p className="text-zinc-400 mb-3">{progress} · {live.blockName} · играет, ждём баззер…</p>
          <button onClick={() => emit('admin:skip')} className="rounded-lg bg-amber-500/80 hover:bg-amber-500 px-4 py-2 font-bold text-white">
            ⏭ Пропустить
          </button>
        </>
      )}
      {live.phase === 'buzzed' && (
        <>
          <p className="text-zinc-400">{progress}</p>
          <p className="font-display text-2xl font-bold text-violet-300 my-3">🔔 {live.buzzed?.name}</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => emit('admin:correct')} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 font-bold text-white">✓ Правильно</button>
            <button onClick={() => emit('admin:wrong')} className="rounded-lg bg-rose-600/90 hover:bg-rose-500 px-4 py-2 font-bold text-white">✕ Неправильно</button>
            <button onClick={() => emit('admin:skip')} className="rounded-lg bg-amber-500/80 hover:bg-amber-500 px-4 py-2 font-bold text-white">⏭ Пропустить</button>
          </div>
        </>
      )}
      {live.phase === 'reveal' && (
        <>
          <p className="text-zinc-400">{progress}</p>
          <p className="text-emerald-300 my-2">✓ {live.reveal?.title} — {live.reveal?.artist}</p>
          <p className="text-zinc-500 text-sm">Доигрываем и переходим дальше…</p>
        </>
      )}
      {live.phase === 'finished' && (
        <>
          <p className="text-zinc-300 mb-2">Игра окончена!</p>
          <p className="text-zinc-400 mb-3">
            {[...live.players].sort((a, b) => b.score - a.score).map((p) => `${p.name}: ${p.score}`).join('  ·  ') || 'Нет игроков'}
          </p>
          <button onClick={() => emit('admin:reset')} className="btn-grad rounded-lg px-4 py-2 font-bold">↺ Заново</button>
        </>
      )}

      {/* игроки */}
      <div className="mt-4 flex flex-wrap gap-2">
        {live.players.map((p) => (
          <span
            key={p.id}
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm ${
              p.connected ? 'bg-white/10 text-zinc-200' : 'bg-white/5 text-zinc-500'
            } ${p.ready ? 'ring-1 ring-emerald-400/40' : ''}`}
          >
            {p.name} <b className="text-violet-300">{p.score}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
