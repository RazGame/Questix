import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Play, Trash2, Upload, Search, RotateCw, Scissors, Link, ChevronUp, ChevronDown } from 'lucide-react';
import { musicCoverSrc, musicService, MusicGameFull, SongSearchResult } from '../services/music';
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

// Прогресс фоновой загрузки песни (событие song-progress с бэкенда).
interface SongProgress {
  bytes: number;
  percent: number | null; // оценка по длительности трека; null — неизвестно
}

const fmtMb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} МБ`;

interface BlockItemProps {
  block: { _id: string; name: string; songIds: string[] };
  gameId: string;
  isFirst: boolean;
  isLast: boolean;
  dlProgress: Record<string, SongProgress>;
  songById: (id: string) => Song | undefined;
  renameBlock: (blockId: string, name: string) => Promise<void>;
  moveBlock: (blockId: string, dir: -1 | 1) => void;
  moveSong: (blockId: string, songId: string, dir: -1 | 1) => void;
  addOwnFile: (blockId: string) => void;
  removeBlock: (blockId: string) => void;
  removeSong: (songId: string) => void;
  uploadFile: (songId: string) => void;
  setSegmentSong: (song: Song) => void;
  refreshCurrent: () => Promise<void>;
  setError: (err: string) => void;
  setNotice: (notice: string) => void;
}

function BlockItem({
  block,
  gameId,
  isFirst,
  isLast,
  dlProgress,
  songById,
  renameBlock,
  moveBlock,
  moveSong,
  addOwnFile,
  removeBlock,
  removeSong,
  uploadFile,
  setSegmentSong,
  refreshCurrent,
  setError,
  setNotice,
}: BlockItemProps) {
  const [searchQ, setSearchQ] = useState('');
  const [results, setResults] = useState<SongSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [playlistImporting, setPlaylistImporting] = useState(false);
  const [showSearch, setShowSearch] = useState(block.songIds.length === 0);

  const doSearch = async () => {
    if (!searchQ.trim()) return;
    setSearching(true);
    setResults([]);
    try {
      const res = await musicService.search(searchQ.trim());
      setResults(res);
      setError('');
      setNotice('');
    } catch (e: any) {
      setError(apiErrorMessage(e, 'Поиск недоступен'));
    } finally {
      setSearching(false);
    }
  };

  const addResult = async (r: SongSearchResult) => {
    try {
      await musicService.addSong(gameId, block._id, r);
      await refreshCurrent();
      setError('');
      setNotice('');
    } catch (e: any) {
      setError(apiErrorMessage(e, 'Ошибка добавления песни'));
    }
  };

  const importPlaylist = async () => {
    if (!playlistUrl.trim()) return;
    setPlaylistImporting(true);
    try {
      const result = await musicService.importPlaylist(gameId, block._id, playlistUrl.trim());
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

  return (
    <div className="rounded-lg border border-white/10 p-3 bg-white/[0.01] hover:border-white/20 transition-all duration-300">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex flex-col">
          <button
            onClick={() => moveBlock(block._id, -1)}
            disabled={isFirst}
            className="text-zinc-500 hover:text-white disabled:opacity-20 disabled:cursor-default p-0.5"
            title="Блок выше"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={() => moveBlock(block._id, 1)}
            disabled={isLast}
            className="text-zinc-500 hover:text-white disabled:opacity-20 disabled:cursor-default p-0.5"
            title="Блок ниже"
          >
            <ChevronDown size={14} />
          </button>
        </div>
        <input
          defaultValue={block.name}
          onBlur={(e) => renameBlock(block._id, e.target.value)}
          className="input-dark flex-1 text-sm font-semibold focus:border-violet-500/50 transition-colors"
        />
        <button
          onClick={() => setShowSearch(!showSearch)}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 flex items-center gap-1 ${
            showSearch
              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
              : 'bg-white/5 text-zinc-300 hover:bg-white/10 border border-transparent'
          }`}
          title="Добавить музыку"
        >
          <Plus size={12} /> {showSearch ? 'Скрыть поиск' : 'добавить музыку'}
        </button>
        <button
          onClick={() => removeBlock(block._id)}
          className="text-rose-400 hover:text-rose-300 p-1.5 hover:bg-rose-500/10 rounded-lg transition"
          title="Удалить блок"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {showSearch && (
        <div className="mb-4 rounded-lg bg-black/20 border border-white/5 p-3.5 space-y-3 qgs-fade-in">
          {/* Search bar */}
          <div className="flex gap-2">
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              placeholder="Поиск песни в Spotify..."
              className="input-dark flex-1 text-xs"
            />
            <button
              onClick={doSearch}
              disabled={searching}
              className="btn-grad flex items-center gap-1 rounded-lg px-3 text-xs font-bold disabled:opacity-50"
            >
              <Search size={14} /> Найти
            </button>
          </div>

          {searching && <p className="text-zinc-500 text-xs animate-pulse">Поиск…</p>}

          {/* Search results */}
          {results.length > 0 && (
            <div className="space-y-1.5 max-h-60 overflow-y-auto rounded bg-black/40 p-2 border border-white/5">
              <div className="flex justify-between items-center px-1 pb-1 border-b border-white/5">
                <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">Результаты ({results.length})</span>
                <button onClick={() => setResults([])} className="text-[10px] text-zinc-500 hover:text-zinc-300">Очистить</button>
              </div>
              {results.map((r, i) => (
                <div key={i} className="flex items-center gap-3 rounded bg-white/[0.01] hover:bg-white/[0.04] p-1.5 transition text-left">
                  {r.cover && <img src={musicCoverSrc(r.cover)} alt="" className="w-8 h-8 rounded" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold">{r.title}</div>
                    <div className="truncate text-[10px] text-zinc-400">{r.artist} · {fmtTime(r.duration || 0)}</div>
                  </div>
                  <button
                    onClick={() => addResult(r)}
                    className="btn-grad rounded px-2.5 py-1 text-[10px] font-bold"
                  >
                    + добавить
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Separator */}
          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-white/5"></div>
            <span className="flex-shrink mx-2 text-[10px] text-zinc-500 uppercase tracking-wider">или импорт плейлиста</span>
            <div className="flex-grow border-t border-white/5"></div>
          </div>

          {/* Playlist import */}
          <div className="flex gap-2">
            <input
              value={playlistUrl}
              onChange={(e) => setPlaylistUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && importPlaylist()}
              placeholder="Ссылка на Spotify-плейлист..."
              className="input-dark flex-1 text-xs"
            />
            <button
              onClick={importPlaylist}
              disabled={playlistImporting || !playlistUrl.trim()}
              className="btn-grad flex items-center gap-1 rounded-lg px-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Link size={14} /> {playlistImporting ? 'Импорт…' : 'Импорт'}
            </button>
          </div>

          {/* Separator for upload */}
          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-white/5"></div>
            <span className="flex-shrink mx-2 text-[10px] text-zinc-500 uppercase tracking-wider">или загрузить аудиофайл</span>
            <div className="flex-grow border-t border-white/5"></div>
          </div>

          {/* Own file upload button */}
          <button
            onClick={() => addOwnFile(block._id)}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-white/10 hover:text-white transition w-full justify-center"
          >
            📁 Выбрать свой файл (MP3, FLAC, и др.)
          </button>
        </div>
      )}

      {/* Song list inside block */}
      <div className="space-y-2">
        {block.songIds.length === 0 && (
          <p className="text-zinc-500 text-xs py-2 text-center">
            Нет песен в этом блоке. Воспользуйтесь кнопкой поиска выше, чтобы добавить треки.
          </p>
        )}
        {block.songIds.map((sid, songIdx) => {
          const s = songById(sid);
          if (!s) return null;
          const seg = s.endSec
            ? `${fmtTime(s.startSec)}–${fmtTime(s.endSec)}`
            : `с ${fmtTime(s.startSec)}`;
          return (
            <div key={s._id} className="rounded-lg bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 p-2 transition duration-200">
              <div className="flex items-center gap-3">
                <div className="flex flex-col -my-1">
                  <button
                    onClick={() => moveSong(block._id, s._id, -1)}
                    disabled={songIdx === 0}
                    className="text-zinc-500 hover:text-white disabled:opacity-20 disabled:cursor-default p-0.5"
                    title="Выше"
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    onClick={() => moveSong(block._id, s._id, 1)}
                    disabled={songIdx === block.songIds.length - 1}
                    className="text-zinc-500 hover:text-white disabled:opacity-20 disabled:cursor-default p-0.5"
                    title="Ниже"
                  >
                    <ChevronDown size={13} />
                  </button>
                </div>
                {s.cover && <img src={musicCoverSrc(s.cover)} alt="" className="w-9 h-9 rounded shadow" />}
                <div className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-semibold">{s.title}</div>
                  <div className="truncate text-xs text-zinc-400">{s.artist}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${statusTone[s.status]}`} title={s.error || ''}>
                  {statusLabels[s.status]}
                </span>
                {s.status === 'ready' && s.file && (
                  <button
                    onClick={() => setSegmentSong(s)}
                    className="flex items-center gap-1 rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-xs text-zinc-200 hover:bg-white/10 transition"
                    title="Выбрать отрезок песни"
                  >
                    <Scissors size={14} /> {seg}
                  </button>
                )}
                {s.sourceUrl && (s.status === 'error' || s.status === 'pending') && (
                  <button
                    onClick={async () => {
                      try {
                        await musicService.downloadSong(gameId, s._id);
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
                <button onClick={() => uploadFile(s._id)} className="text-zinc-400 hover:text-white p-1 hover:bg-white/5 rounded transition" title="Загрузить файл">
                  <Upload size={15} />
                </button>
                <button onClick={() => removeSong(s._id)} className="text-rose-400 hover:text-rose-300 p-1 hover:bg-rose-500/10 rounded transition" title="Убрать песню">
                  <Trash2 size={15} />
                </button>
              </div>
              {s.status === 'downloading' && (() => {
                const p = dlProgress[s._id];
                // Есть оценка процента — детерминированная полоса, иначе бегущая.
                return p && p.percent != null ? (
                  <div className="mt-2">
                    <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-700"
                        style={{ width: `${Math.max(3, p.percent)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-right text-[10px] text-zinc-500">
                      {fmtMb(p.bytes)} · ~{p.percent}%
                    </p>
                  </div>
                ) : (
                  <div className="mt-2">
                    <div className="qgs-loading-track h-1.5 w-full rounded-full bg-white/10 overflow-hidden" />
                    {p && p.bytes > 0 && (
                      <p className="mt-1 text-right text-[10px] text-zinc-500">{fmtMb(p.bytes)}</p>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MusicAdmin({ isTab = false }: { isTab?: boolean }) {
  const navigate = useNavigate();
  const [games, setGames] = useState<(MusicGame & { songCount: number })[]>([]);
  const [current, setCurrent] = useState<MusicGameFull | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [spotiVersion, setSpotiVersion] = useState<string | null>(null);
  const [segmentSong, setSegmentSong] = useState<Song | null>(null); // открытая модалка отрезка
  const [dlProgress, setDlProgress] = useState<Record<string, SongProgress>>({});

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
      // Загрузка завершилась (ready/error) — прогресс больше не актуален.
      if (song.status !== 'downloading') {
        setDlProgress((prev) => {
          if (!(song._id in prev)) return prev;
          const next = { ...prev };
          delete next[song._id];
          return next;
        });
      }
    });
    socket.on('song-progress', (p: { songId: string } & SongProgress) => {
      setDlProgress((prev) => ({ ...prev, [p.songId]: { bytes: p.bytes, percent: p.percent } }));
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
      await musicService.update(current.game._id, { title });
      await loadGames(true);
      setError('');
    } catch (e: any) {
      setCurrent({ ...current, game: { ...current.game, title: previous } });
      setError(apiErrorMessage(e, 'Ошибка переименования музыкальной игры'));
    }
  };
  // Переключение режима входа (без авторизации / по аккаунту).
  // В командном режиме вход всегда «по аккаунту» — менять нельзя.
  const setAuthMode = async (auth: 'open' | 'required') => {
    if (!current) return;
    if (current.game.participation === 'team') return;
    const previous = current.game.auth;
    setCurrent({ ...current, game: { ...current.game, auth } });
    try {
      await musicService.update(current.game._id, { auth });
      setError('');
    } catch (e: any) {
      setCurrent({ ...current, game: { ...current.game, auth: previous } });
      setError(apiErrorMessage(e, 'Ошибка смены режима входа'));
    }
  };

  // Переключение состава (одиночная / командная). Командная требует авторизации.
  const setParticipation = async (participation: 'solo' | 'team') => {
    if (!current) return;
    const prevPart = current.game.participation;
    const prevAuth = current.game.auth;
    const nextAuth = participation === 'team' ? 'required' : current.game.auth;
    setCurrent({ ...current, game: { ...current.game, participation, auth: nextAuth } });
    try {
      await musicService.update(current.game._id, { participation });
      setError('');
    } catch (e: any) {
      setCurrent({ ...current, game: { ...current.game, participation: prevPart, auth: prevAuth } });
      setError(apiErrorMessage(e, 'Ошибка смены состава игроков'));
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
      await musicService.updateBlock(current.game._id, blockId, { name });
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
  // Перемещение блока вверх/вниз: оптимистично локально, затем сервер.
  const moveBlock = async (blockId: string, dir: -1 | 1) => {
    if (!current) return;
    const blocks = [...current.game.blocks];
    const i = blocks.findIndex((b) => b._id === blockId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= blocks.length) return;
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    setCurrent({ ...current, game: { ...current.game, blocks } });
    try {
      await musicService.update(current.game._id, { blockOrder: blocks.map((b) => b._id) });
      setError('');
    } catch (e: any) {
      setError(apiErrorMessage(e, 'Ошибка перемещения блока'));
      try { await refreshCurrent(); } catch { /* сообщение уже показано */ }
    }
  };
  // Перемещение песни внутри блока вверх/вниз.
  const moveSong = async (blockId: string, songId: string, dir: -1 | 1) => {
    if (!current) return;
    const block = current.game.blocks.find((b) => b._id === blockId);
    if (!block) return;
    const ids = [...block.songIds];
    const i = ids.indexOf(songId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setCurrent({
      ...current,
      game: {
        ...current.game,
        blocks: current.game.blocks.map((b) => (b._id === blockId ? { ...b, songIds: ids } : b)),
      },
    });
    try {
      await musicService.updateBlock(current.game._id, blockId, { songIds: ids });
      setError('');
    } catch (e: any) {
      setError(apiErrorMessage(e, 'Ошибка перемещения песни'));
      try { await refreshCurrent(); } catch { /* сообщение уже показано */ }
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

  const songById = (id: string) => current?.songs.find((s) => s._id === id);

  const content = (
    <>
      {!isTab && <p className="tech-label mb-2">[ угадай мелодию ]</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="text-2xl font-bold">{isTab ? 'Музыкальные игры' : 'Музыкальные игры'}</h2>
        <span className="text-xs text-zinc-500">
          SpotiFLAC: {spotiVersion || '—'}
        </span>
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
          <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto">
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

                {/* Режимы игры */}
                <div className="mt-4 flex flex-wrap gap-6 border-t border-white/10 pt-4">
                  {/* Участники */}
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Участники</p>
                    <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-1">
                      {([
                        { v: 'solo', label: 'Одиночная' },
                        { v: 'team', label: 'Командная' },
                      ] as const).map((o) => (
                        <button
                          key={o.v}
                          onClick={() => setParticipation(o.v)}
                          className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                            (current.game.participation || 'solo') === o.v
                              ? 'btn-grad'
                              : 'text-zinc-300 hover:bg-white/10'
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Вход */}
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Вход</p>
                    <div className={`inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-1 ${
                      current.game.participation === 'team' ? 'opacity-60' : ''
                    }`}>
                      {([
                        { v: 'open', label: 'Без авторизации' },
                        { v: 'required', label: 'По аккаунту' },
                      ] as const).map((o) => (
                        <button
                          key={o.v}
                          onClick={() => setAuthMode(o.v)}
                          disabled={current.game.participation === 'team'}
                          className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                            (current.game.auth || 'open') === o.v
                              ? 'btn-grad'
                              : 'text-zinc-300 hover:bg-white/10'
                          } ${current.game.participation === 'team' ? 'cursor-not-allowed' : ''}`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                    {current.game.participation === 'team' && (
                      <p className="mt-1 text-[11px] text-zinc-500">Командная игра — всегда по аккаунту</p>
                    )}
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
                  {current.game.blocks.map((b, blockIdx) => (
                    <BlockItem
                      key={b._id}
                      block={b}
                      gameId={current.game._id}
                      isFirst={blockIdx === 0}
                      isLast={blockIdx === current.game.blocks.length - 1}
                      dlProgress={dlProgress}
                      songById={songById}
                      renameBlock={renameBlock}
                      moveBlock={moveBlock}
                      moveSong={moveSong}
                      addOwnFile={addOwnFile}
                      removeBlock={removeBlock}
                      removeSong={removeSong}
                      uploadFile={uploadFile}
                      setSegmentSong={setSegmentSong}
                      refreshCurrent={refreshCurrent}
                      setError={setError}
                      setNotice={setNotice}
                    />
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
