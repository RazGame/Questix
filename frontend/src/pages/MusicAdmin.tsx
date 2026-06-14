import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Play, Trash2, Upload, RefreshCw, Search, RotateCw, Scissors, Link } from 'lucide-react';
import { musicService, MusicGameFull, SongSearchResult } from '../services/music';
import { createSocket } from '../services/socket';
import { MusicGame, Song } from '../types';
import MusicSegmentModal from './MusicSegmentModal';

const fmtTime = (s: number) => {
  s = Math.max(0, Math.round(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const statusLabels: Record<Song['status'], string> = {
  ready: 'готово',
  pending: 'ожидает',
  downloading: 'скачивание',
  error: 'ошибка',
};
const statusTone: Record<Song['status'], string> = {
  ready: 'bg-emerald-400/10 text-emerald-300',
  pending: 'bg-white/10 text-zinc-400',
  downloading: 'bg-sky-400/10 text-sky-300',
  error: 'bg-rose-400/10 text-rose-300',
};

const apiErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error ||
  error?.response?.data?.errors?.[0] ||
  error?.message ||
  fallback;

export default function MusicAdmin({ isTab = false }: { isTab?: boolean }) {
  const navigate = useNavigate();
  const [games, setGames] = useState<(MusicGame & { songCount: number })[]>([]);
  const [current, setCurrent] = useState<MusicGameFull | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [results, setResults] = useState<SongSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [targetBlock, setTargetBlock] = useState('');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [playlistImporting, setPlaylistImporting] = useState(false);
  const [spotiVersion, setSpotiVersion] = useState<string | null>(null);
  const [segmentSong, setSegmentSong] = useState<Song | null>(null); // открытая модалка отрезка

  const loadGames = useCallback(async (throwOnError = false) => {
    try {
      setGames(await musicService.list());
    } catch (e: any) {
      setError(apiErrorMessage(e, 'Ошибка загрузки игр'));
      if (throwOnError) throw e;
    }
  }, []);

  useEffect(() => { loadGames(); }, [loadGames]);
  useEffect(() => {
    musicService.spotiflacVersion().then((v) => setSpotiVersion(v.version)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!current?.game._id) return;

    const socket = createSocket(localStorage.getItem('token'));
    socket.emit('join', { role: 'admin', gameId: current.game._id });
    socket.on('song-updated', ({ song }: { song?: Song }) => {
      if (!song) return;
      setCurrent((prev) => {
        if (!prev || prev.game._id !== current.game._id) return prev;
        return {
          ...prev,
          songs: prev.songs.map((item) => (item._id === song._id ? song : item)),
        };
      });
      setSegmentSong((prev) => (prev?._id === song._id ? song : prev));
    });
    socket.on('error-msg', ({ message }: { message?: string }) => {
      if (message) setError(message);
    });

    return () => {
      socket.disconnect();
    };
  }, [current?.game._id]);

  const selectGame = async (id: string, throwOnError = false) => {
    try {
      const full = await musicService.get(id);
      setCurrent(full);
      setTargetBlock(full.game.blocks[0]?._id || '');
      setError('');
      setNotice('');
    } catch (e: any) {
      setError(apiErrorMessage(e, 'Ошибка загрузки игры'));
      if (throwOnError) throw e;
    }
  };

  const refreshCurrent = async () => {
    try {
      if (current) {
        const full = await musicService.get(current.game._id);
        setCurrent(full);
      }
      await loadGames(true);
    } catch (e: any) {
      setError(apiErrorMessage(e, 'Ошибка обновления данных игры'));
      throw e;
    }
  };

  // --- игры ---
  const createGame = async () => {
    try {
      const g = await musicService.create('Новая музыкальная игра');
      await loadGames(true);
      await selectGame(g._id, true);
      setError('');
    } catch (e: any) {
      setError(apiErrorMessage(e, 'Ошибка создания музыкальной игры'));
    }
  };
  const deleteGame = async () => {
    if (!current || !confirm(`Удалить игру «${current.game.title}»?`)) return;
    try {
      await musicService.remove(current.game._id);
      setCurrent(null);
      await loadGames(true);
      setError('');
    } catch (e: any) {
      setError(apiErrorMessage(e, 'Ошибка удаления музыкальной игры'));
    }
  };
  const renameGame = async (title: string) => {
    if (!current) return;
    const previous = current.game.title;
    setCurrent({ ...current, game: { ...current.game, title } });
    try {
      await musicService.update(current.game._id, title);
      await loadGames(true);
      setError('');
    } catch (e: any) {
      setCurrent({ ...current, game: { ...current.game, title: previous } });
      setError(apiErrorMessage(e, 'Ошибка переименования музыкальной игры'));
    }
  };

  // --- блоки ---
  const addBlock = async () => {
    if (!current) return;
    try {
      await musicService.addBlock(current.game._id);
      await refreshCurrent();
      setError('');
    } catch (e: any) {
      setError(apiErrorMessage(e, 'Ошибка добавления блока'));
    }
  };
  const renameBlock = async (blockId: string, name: string) => {
    if (!current) return;
    try {
      await musicService.updateBlock(current.game._id, blockId, name);
      setError('');
    } catch (e: any) {
      const message = apiErrorMessage(e, 'Ошибка переименования блока');
      setError(message);
      try {
        await refreshCurrent();
      } catch {
        setError(message);
      }
    }
  };
  const removeBlock = async (blockId: string) => {
    if (!current || !confirm('Удалить блок со всеми песнями?')) return;
    try {
      await musicService.removeBlock(current.game._id, blockId);
      await refreshCurrent();
      setError('');
    } catch (e: any) {
      setError(apiErrorMessage(e, 'Ошибка удаления блока'));
    }
  };

  // --- песни ---
  const removeSong = async (songId: string) => {
    if (!current) return;
    try {
      await musicService.removeSong(current.game._id, songId);
      await refreshCurrent();
      setError('');
    } catch (e: any) {
      setError(apiErrorMessage(e, 'Ошибка удаления песни'));
    }
  };
  const uploadFile = (songId: string) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'audio/*,.flac,.mp3,.m4a,.ogg,.wav';
    inp.onchange = async () => {
      if (inp.files?.[0] && current) {
        try {
          await musicService.uploadSongFile(current.game._id, songId, inp.files[0]);
          await refreshCurrent();
          setError('');
        } catch (e: any) {
          setError(apiErrorMessage(e, 'Ошибка загрузки файла песни'));
        }
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
        try {
          const f = inp.files[0];
          const song = await musicService.addSong(current.game._id, blockId, {
            title: f.name.replace(/\.[^.]+$/, ''),
            artist: '',
          });
          await musicService.uploadSongFile(current.game._id, song._id, f);
          await refreshCurrent();
          setError('');
        } catch (e: any) {
          setError(apiErrorMessage(e, 'Ошибка добавления файла в блок'));
        }
      }
    };
    inp.click();
  };

  // --- поиск ---
  const doSearch = async () => {
    if (!searchQ.trim()) return;
    setSearching(true);
    setResults([]);
    try {
      setResults(await musicService.search(searchQ.trim()));
      setError('');
      setNotice('');
    } catch (e: any) {
      setError(apiErrorMessage(e, 'Поиск недоступен'));
    }
    finally { setSearching(false); }
  };
  const addResult = async (r: SongSearchResult) => {
    if (!current || !targetBlock) return;
    try {
      await musicService.addSong(current.game._id, targetBlock, r);
      await refreshCurrent();
      setError('');
      setNotice('');
    } catch (e: any) {
      setError(apiErrorMessage(e, 'Ошибка добавления песни'));
    }
  };

  const importPlaylist = async () => {
    if (!current || !targetBlock || !playlistUrl.trim()) return;
    setPlaylistImporting(true);
    try {
      const result = await musicService.importPlaylist(current.game._id, targetBlock, playlistUrl.trim());
      await refreshCurrent();
      setPlaylistUrl('');
      const playlistName = result.playlist?.name ? `«${result.playlist.name}» ` : '';
      setError('');
      setNotice(`${playlistName}добавлено: ${result.imported}, пропущено дублей: ${result.skipped}`);
    } catch (e: any) {
      setError(apiErrorMessage(e, 'Не удалось импортировать плейлист'));
    } finally {
      setPlaylistImporting(false);
    }
  };

  const updateSpotiflac = async () => {
    setSpotiVersion('обновление…');
    try {
      setSpotiVersion((await musicService.spotiflacUpdate()).version);
      setError('');
      setNotice('');
    } catch (e: any) {
      setError(apiErrorMessage(e, 'Не удалось обновить SpotiFLAC'));
      setSpotiVersion(null);
    }
  };

  const songById = (id: string) => current?.songs.find((s) => s._id === id);

  const content = (
    <>
      {!isTab && <p className="tech-label mb-2">[ угадай мелодию ]</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="text-2xl font-bold">{isTab ? 'Музыкальные игры' : 'Музыкальные игры'}</h2>
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
      {notice && (
        <div className="mb-4 rounded border border-emerald-500/20 bg-emerald-500/10 p-3 text-emerald-300">
          {notice}
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
                      onClick={() => {
                        navigate(`/admin/music/host/${current.game._id}`);
                      }}
                      className="btn-grad flex items-center gap-1 rounded-lg px-4 py-2 font-bold"
                    >
                      <Play size={17} /> Начать игру
                    </button>
                    <button onClick={deleteGame} className="text-rose-400 hover:text-rose-300 p-2" title="Удалить игру">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>


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
                <div className="mt-4 border-t border-white/10 pt-4">
                  <div className="flex gap-2">
                    <input
                      value={playlistUrl}
                      onChange={(e) => setPlaylistUrl(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && importPlaylist()}
                      placeholder="Ссылка на Spotify-плейлист…"
                      className="input-dark flex-1"
                    />
                    <button
                      onClick={importPlaylist}
                      disabled={playlistImporting || !playlistUrl.trim()}
                      className="btn-grad flex items-center gap-1 rounded-lg px-4 font-bold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Link size={17} /> {playlistImporting ? 'Импорт…' : 'Импорт'}
                    </button>
                  </div>
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
                                    onClick={async () => {
                                      try {
                                        await musicService.downloadSong(current.game._id, s._id);
                                        await refreshCurrent();
                                        setError('');
                                      } catch (e: any) {
                                        setError(apiErrorMessage(e, 'Ошибка запуска загрузки песни'));
                                      }
                                    }}
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
                                <div className="qgs-loading-track mt-2 h-1.5 w-full rounded-full bg-white/10" />
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
    </>
  );

  if (isTab) {
    return <div className="mt-2">{content}</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-4 py-8">
      {content}
    </div>
  );
}
