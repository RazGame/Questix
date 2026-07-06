import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Play, Pause, RotateCcw, Save } from 'lucide-react';
import { musicService } from '../services/music';
import { Song } from '../types';

const mediaOrigin =
  import.meta.env.VITE_SOCKET_URL ||
  `${window.location.protocol}//${window.location.hostname}:5000`;

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ds = Math.floor((s * 10) % 10);
  return `${m}:${String(sec).padStart(2, '0')}.${ds}`;
};
const parse = (str: string) => {
  str = str.trim();
  if (str.includes(':')) {
    const [m, rest] = str.split(':');
    return (parseInt(m, 10) || 0) * 60 + (parseFloat(rest) || 0);
  }
  return parseFloat(str) || 0;
};

// Модалка выбора отрезка песни: волна + перетаскиваемые ручки start/end + превью.
export default function MusicSegmentModal({
  gameId,
  song,
  onClose,
  onSaved,
}: {
  gameId: string;
  song: Song;
  onClose: () => void;
  onSaved: (s: Song) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const peaksRef = useRef<number[]>([]);
  const dragRef = useRef<'start' | 'end' | null>(null);
  const startRef = useRef(song.startSec || 0);
  const endRef = useRef(song.endSec ?? song.duration ?? 0);

  const [duration, setDuration] = useState(song.duration || 0);
  const [start, setStart] = useState(song.startSec || 0);
  const [end, setEnd] = useState(song.endSec ?? song.duration ?? 0);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const audioUrl = `${mediaOrigin}/media/${song.file}`;

  useEffect(() => { startRef.current = start; }, [start]);
  useEffect(() => { endRef.current = end; }, [end]);

  // декод аудио → пики для волны
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const buf = await fetch(audioUrl).then((r) => r.arrayBuffer());
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audio = await ctx.decodeAudioData(buf);
        if (cancelled) return;
        const ch = audio.getChannelData(0);
        const buckets = 900;
        const size = Math.floor(ch.length / buckets);
        const peaks: number[] = [];
        for (let i = 0; i < buckets; i++) {
          let max = 0;
          for (let j = 0; j < size; j++) {
            const v = Math.abs(ch[i * size + j] || 0);
            if (v > max) max = v;
          }
          peaks.push(max);
        }
        peaksRef.current = peaks;
        setDuration(audio.duration);
        setEnd((e) => {
          const next = e && e > 0 ? Math.min(e, audio.duration) : audio.duration;
          endRef.current = next;
          return next;
        });
        ctx.close();
      } catch {
        setError('Не удалось прочитать аудио для волны');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  // отрисовка волны + выделения
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cctx = canvas.getContext('2d');
    if (!cctx) return;
    const w = canvas.width, h = canvas.height;
    const peaks = peaksRef.current;
    cctx.clearRect(0, 0, w, h);

    const x0 = duration ? (start / duration) * w : 0;
    const x1 = duration ? (end / duration) * w : w;

    // фон выделения
    cctx.fillStyle = 'rgba(139,92,246,0.14)';
    cctx.fillRect(x0, 0, x1 - x0, h);

    // волна: вне выделения тусклая, внутри — яркая
    const n = peaks.length || 1;
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      const x = i * bw;
      const bh = Math.max(2, peaks[i] * h * 0.9);
      const inSel = x >= x0 && x <= x1;
      cctx.fillStyle = inSel ? '#a78bfa' : 'rgba(255,255,255,0.18)';
      cctx.fillRect(x, (h - bh) / 2, Math.max(1, bw - 0.5), bh);
    }

    // ручки
    cctx.fillStyle = '#22d3ee';
    cctx.fillRect(x0 - 2, 0, 4, h);
    cctx.fillRect(x1 - 2, 0, 4, h);
  }, [start, end, duration]);

  useEffect(() => { draw(); }, [draw, loading]);

  // перетаскивание ручек
  const pickHandle = (clientX: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const t = ((clientX - rect.left) / rect.width) * duration;
    return Math.abs(t - start) < Math.abs(t - end) ? 'start' : 'end';
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!duration) return;
    dragRef.current = pickHandle(e.clientX);
    onPointerMove(e);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !duration) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    let t = ((e.clientX - rect.left) / rect.width) * duration;
    t = Math.max(0, Math.min(duration, t));
    if (dragRef.current === 'start') {
      const next = Math.min(t, endRef.current - 0.5);
      startRef.current = next;
      setStart(next);
    } else {
      const next = Math.max(t, startRef.current + 0.5);
      endRef.current = next;
      setEnd(next);
    }
  };
  const playPreviewFromStart = () => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = startRef.current;
    a.play().then(() => setPlaying(true)).catch(() => {});
  };
  const onPointerUp = () => {
    const wasDragging = !!dragRef.current;
    dragRef.current = null;
    if (wasDragging) playPreviewFromStart();
  };

  // превью отрезка
  const togglePreview = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); return; }
    playPreviewFromStart();
  };
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => { if (a.currentTime >= end) { a.pause(); setPlaying(false); } };
    a.addEventListener('timeupdate', onTime);
    return () => a.removeEventListener('timeupdate', onTime);
  }, [end]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await musicService.updateSong(gameId, song._id, {
        startSec: Math.round(start),
        endSec: Math.round(end),
      });
      onSaved(updated);
      onClose();
    } catch {
      setError('Не удалось сохранить отрезок');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onPointerUp={onPointerUp}
      onPointerMove={(e) => dragRef.current && onPointerMove(e)}
    >
      <div className="glass w-full max-w-4xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold truncate">{song.title}</h2>
            <p className="text-sm text-zinc-400 truncate">{song.artist}</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white p-1">
            <X size={22} />
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded border border-rose-500/20 bg-rose-500/10 p-2 text-sm text-rose-300">
            {error}
          </div>
        )}

        <div className="relative rounded-lg border border-white/10 bg-white/[0.02] p-2">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-zinc-400">
              Читаю волну…
            </div>
          )}
          <canvas
            ref={canvasRef}
            width={1320}
            height={220}
            className="w-full cursor-ew-resize touch-none"
            onPointerDown={onPointerDown}
          />
        </div>

        <audio ref={audioRef} src={audioUrl} preload="auto" className="hidden" />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={togglePreview} className="btn-grad flex items-center gap-2 rounded-lg px-4 py-2 font-bold">
            {playing ? <Pause size={17} /> : <Play size={17} />}
            {playing ? 'Пауза' : 'Превью отрезка'}
          </button>
          <button
            onClick={() => { setStart(0); setEnd(duration); }}
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
          >
            <RotateCcw size={15} /> Весь трек
          </button>

          <label className="flex items-center gap-2 text-sm text-zinc-400">
            Начало
            <input
              value={fmt(start)}
              onChange={(e) => setStart(Math.max(0, Math.min(parse(e.target.value), end - 0.5)))}
              className="input-dark w-24 px-2 py-1 text-center font-mono"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            Конец
            <input
              value={fmt(end)}
              onChange={(e) => setEnd(Math.min(duration, Math.max(parse(e.target.value), start + 0.5)))}
              className="input-dark w-24 px-2 py-1 text-center font-mono"
            />
          </label>
          <span className="text-sm text-zinc-500">длина {fmt(end - start)}</span>

          <button
            onClick={save}
            disabled={saving || loading}
            className="btn-grad ml-auto flex items-center gap-2 rounded-lg px-5 py-2 font-bold disabled:opacity-50"
          >
            <Save size={17} /> {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
