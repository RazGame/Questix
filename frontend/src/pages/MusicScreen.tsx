import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { createSocket } from '../services/socket';
import { musicService } from '../services/music';
import { MusicState } from '../types';

// Аудио-движок держим вне React-рендера (в ref), чтобы команды cmd
// исполнялись мгновенно и не зависели от перерисовок.
interface AudioEngine {
  audio: HTMLAudioElement;
  next: HTMLAudioElement;
  ctx: AudioContext;
  analyser: AnalyserNode;
  gain: GainNode;
  freq: Uint8Array;
  minFreq?: Float32Array;
  maxFreq?: Float32Array;
}

const apiOrigin =
  import.meta.env.VITE_SOCKET_URL ||
  `${window.location.protocol}//${window.location.hostname}:5000`;

export default function MusicScreen() {
  const { gameId } = useParams<{ gameId: string }>();
  const engineRef = useRef<AudioEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  // Отрезок воспроизведения: зацикливаем start→end, пока идёт раунд.
  const loopRef = useRef<{ start: number; end: number | null; active: boolean }>({
    start: 0, end: null, active: false,
  });
  const pendingPlayRef = useRef<{ fileUrl: string; startSec: number; endSec: number | null; nextUrl?: string | null } | null>(null);

  const [needGate, setNeedGate] = useState(true);
  const [state, setState] = useState<MusicState | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState('');
  // Анимации центра: вспышка верно/неверно и показ обложки.
  const [flash, setFlash] = useState<'green' | 'red' | null>(null);
  const [showCover, setShowCover] = useState(false);
  const prevPhase = useRef<string | null>(null);

  // ---------- аудио ----------
  const initAudio = () => {
    if (engineRef.current) return engineRef.current;
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    const next = new Audio();
    next.crossOrigin = 'anonymous';
    next.preload = 'auto';
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const srcNode = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.minDecibels = -100;
    analyser.maxDecibels = -10;
    analyser.smoothingTimeConstant = 0.8;
    srcNode.connect(gain);
    gain.connect(ctx.destination);
    srcNode.connect(analyser);
    // Зацикливание отрезка: при достижении конца возвращаемся к старту.
    audio.addEventListener('timeupdate', () => {
      const l = loopRef.current;
      if (l.active && l.end && audio.currentTime >= l.end) {
        try { audio.currentTime = l.start; } catch { /* ignore */ }
      }
    });
    engineRef.current = {
      audio,
      next,
      ctx,
      analyser,
      gain,
      freq: new Uint8Array(analyser.frequencyBinCount),
      minFreq: new Float32Array(analyser.frequencyBinCount).fill(255),
      maxFreq: new Float32Array(analyser.frequencyBinCount).fill(0)
    };
    return engineRef.current;
  };

  const unlock = () => {
    try {
      const e = initAudio();
      e.ctx.resume();
      if (pendingPlayRef.current) {
        const p = pendingPlayRef.current;
        pendingPlayRef.current = null;
        playFrom(p.fileUrl, p.startSec, p.endSec, p.nextUrl);
      } else {
        e.audio.play().then(() => e.audio.pause()).catch(() => {});
      }
    } catch { /* ignore */ }
    setNeedGate(false);
  };

  const playFrom = (fileUrl: string, startSec: number, endSec: number | null, nextUrl?: string | null) => {
    const e = initAudio();
    if (e.ctx.state === 'suspended') e.ctx.resume();
    e.gain.gain.cancelScheduledValues(e.ctx.currentTime);
    e.gain.gain.setValueAtTime(1, e.ctx.currentTime);
    loopRef.current = { start: startSec || 0, end: endSec, active: true };
    e.audio.src = apiOrigin + fileUrl;
    pendingPlayRef.current = { fileUrl, startSec, endSec, nextUrl };
    const seek = () => {
      try { e.audio.currentTime = startSec || 0; } catch { /* ignore */ }
      e.audio.removeEventListener('loadedmetadata', seek);
    };
    e.audio.addEventListener('loadedmetadata', seek);
    e.audio.play()
      .then(() => {
        pendingPlayRef.current = null;
      })
      .catch((err) => {
        console.warn('Playback blocked, showing interaction gate:', err);
        setNeedGate(true);
      });
    if (nextUrl) e.next.src = apiOrigin + nextUrl;
  };

  const fadeAndStop = (playMs: number, fadeMs: number) => {
    loopRef.current.active = false; // во время доигрыша/фейда не зацикливаем
    setTimeout(() => {
      const e = engineRef.current;
      if (!e) return;
      const now = e.ctx.currentTime;
      e.gain.gain.cancelScheduledValues(now);
      e.gain.gain.setValueAtTime(e.gain.gain.value, now);
      e.gain.gain.linearRampToValueAtTime(0.0001, now + fadeMs / 1000);
      setTimeout(() => e.audio.pause(), fadeMs + 100);
    }, playMs);
  };

  // ---------- круговой эквалайзер ----------
  const startViz = () => {
    if (rafRef.current) return;
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const cctx = canvas.getContext('2d');
      if (!cctx) return;
      const w = canvas.width, h = canvas.height;
      const cx = w / 2, cy = h / 2;
      const baseR = Math.min(w, h) * 0.22;
      cctx.clearRect(0, 0, w, h);

      const e = engineRef.current;
      const playing = e && !e.audio.paused;
      if (playing) {
        e!.analyser.getByteFrequencyData(e!.freq as any);
        
        if (!e!.minFreq) e!.minFreq = new Float32Array(e!.freq.length).fill(255);
        if (!e!.maxFreq) e!.maxFreq = new Float32Array(e!.freq.length).fill(0);
        
        for (let k = 0; k < e!.freq.length; k++) {
          const val = e!.freq[k];
          if (val < e!.minFreq[k]) {
            e!.minFreq[k] = val;
          } else {
            e!.minFreq[k] = e!.minFreq[k] * 0.999 + val * 0.001;
          }
          if (val > e!.maxFreq[k]) {
            e!.maxFreq[k] = val;
          } else {
            e!.maxFreq[k] = e!.maxFreq[k] * 0.995 + val * 0.005;
          }
        }

        if (Math.random() < 0.01) {
          console.log("VIZ_DEBUG freq array:", Array.from(e!.freq).slice(0, 15));
        }
      }
      const bars = 72;

      for (let i = 0; i < bars; i++) {
        const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
        let v: number;
        if (playing) {
          // Зеркальное отображение: левая и правая половины танцуют симметрично
          const halfBars = bars / 2;
          const indexInHalf = i < halfBars ? i : bars - i - 1;
          // Распределяем первые 35 битов частот (басы + вокал + средние)
          const freqIndex = Math.floor((indexInHalf / halfBars) * 35);
          const raw = e!.freq[freqIndex] || 0;
          
          const min = e!.minFreq ? e!.minFreq[freqIndex] : 150;
          const max = e!.maxFreq ? e!.maxFreq[freqIndex] : 255;
          const range = max - min;
          
          let normalizedRaw = range > 10 ? (raw - min) / range : 0;
          normalizedRaw = Math.max(0, Math.min(1.0, normalizedRaw));
          
          // Применим степенную функцию для увеличения контраста (размаха)
          normalizedRaw = Math.pow(normalizedRaw, 2.0);
          
          const boost = 1.0 + (freqIndex / 35) * 0.8;
          v = normalizedRaw * boost;
          v = Math.min(1.0, v);
        } else {
          // тихий «вдох-выдох», когда музыка не играет (баззер)
          v = 0.05 + 0.03 * Math.abs(Math.sin(Date.now() / 700 + i / 4));
        }
        const len = baseR * (0.08 + v * 0.95);
        const x0 = cx + Math.cos(angle) * baseR;
        const y0 = cy + Math.sin(angle) * baseR;
        const x1 = cx + Math.cos(angle) * (baseR + len);
        const y1 = cy + Math.sin(angle) * (baseR + len);
        const grad = cctx.createLinearGradient(x0, y0, x1, y1);
        if (playing) {
          grad.addColorStop(0, '#8b5cf6');
          grad.addColorStop(1, '#d946ef');
        } else {
          grad.addColorStop(0, 'rgba(255,255,255,0.12)');
          grad.addColorStop(1, 'rgba(255,255,255,0.04)');
        }
        cctx.strokeStyle = grad;
        cctx.lineWidth = 6;
        cctx.lineCap = 'round';
        cctx.beginPath();
        cctx.moveTo(x0, y0);
        cctx.lineTo(x1, y1);
        cctx.stroke();
      }
    };
    draw();
  };
  const stopViz = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  // ---------- сокет ----------
  useEffect(() => {
    if (!gameId) return;
    const socket = createSocket();
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('join', { role: 'screen', gameId }));
    socket.on('cmd', (m: any) => {
      if (m.action === 'play') playFrom(m.fileUrl, m.startSec, m.endSec ?? null, m.nextUrl);
      else if (m.action === 'pause') engineRef.current?.audio.pause();
      else if (m.action === 'resume') { loopRef.current.active = true; engineRef.current?.audio.play().catch(() => {}); }
      else if (m.action === 'fadeAndStop') fadeAndStop(m.playMs, m.fadeMs);
      else if (m.action === 'stop') {
        loopRef.current.active = false;
        const e = engineRef.current;
        if (e) { e.audio.pause(); e.audio.currentTime = 0; }
      }
    });
    socket.on('state', (st: MusicState) => setState(st));
    return () => { socket.disconnect(); stopViz(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  // QR строим один раз в лобби.
  // База входа: PUBLIC_WEB_BASE с сервера, иначе origin, по которому ведущий
  // открыл этот экран (для проектора по LAN-IP это верный адрес для телефонов).
  useEffect(() => {
    if (state?.phase === 'lobby' && state.code && !qr) {
      (async () => {
        try {
          let base = window.location.origin;
          try {
            const net = await musicService.net();
            if (net.base) base = net.base;
          } catch { /* нет сети/прав — используем origin */ }
          const url = `${base}/m/play?code=${state.code}`;
          setJoinUrl(url);
          setQr(await musicService.qr(url));
        } catch { /* ignore */ }
      })();
    }
  }, [state?.phase, state?.code, qr]);

  // визуализация активна в игре/баззере/reveal
  useEffect(() => {
    if (state && ['playing', 'buzzed', 'reveal'].includes(state.phase)) startViz();
    else stopViz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase]);

  // Синхронизация воспроизведения при перезагрузке страницы или лагах сокета (через стейт)
  useEffect(() => {
    if (!state || needGate) return;
    const e = initAudio();
    const phase = state.phase;
    const curFile = state.fileUrl;

    if (['playing', 'buzzed', 'reveal'].includes(phase) && curFile) {
      const targetSrc = apiOrigin + curFile;
      const cleanSrc = e.audio.src.replace(/^https?:\/\/[^/]+/i, '');
      const targetClean = targetSrc.replace(/^https?:\/\/[^/]+/i, '');

      if (cleanSrc !== targetClean) {
        playFrom(curFile, state.startSec || 0, state.endSec ?? null, state.nextUrl);
      } else {
        if (phase === 'playing') {
          if (e.audio.paused) {
            loopRef.current.active = true;
            e.audio.play().catch(() => setNeedGate(true));
          }
        } else if (phase === 'buzzed') {
          if (!e.audio.paused) {
            e.audio.pause();
          }
        }
      }
    } else if (phase === 'finished' || phase === 'lobby') {
      if (!e.audio.paused) {
        loopRef.current.active = false;
        e.audio.pause();
        e.audio.currentTime = 0;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, state?.fileUrl, needGate]);

  // анимации центра по сменам фаз
  useEffect(() => {
    const phase = state?.phase || null;
    const prev = prevPhase.current;
    if (phase !== prev) {
      if (phase === 'reveal') {
        // верный ответ: зелёная вспышка, затем обложка
        setFlash('green');
        setShowCover(false);
        setTimeout(() => setShowCover(true), 450);
        setTimeout(() => setFlash(null), 1100);
      } else if (prev === 'buzzed' && phase === 'playing') {
        // неверный ответ: красная вспышка и возврат
        setFlash('red');
        setTimeout(() => setFlash(null), 800);
      } else if (phase === 'playing') {
        setShowCover(false);
        setFlash(null);
      } else if (phase === 'lobby' || phase === 'finished') {
        setShowCover(false);
        setFlash(null);
      }
      prevPhase.current = phase;
    }
  }, [state?.phase]);

  const phase = state?.phase;
  const inRound = phase === 'playing' || phase === 'buzzed' || phase === 'reveal';

  // классы центрального круга
  let centerCls = 'border-violet-400/50 bg-surface/70';
  if (flash === 'green') centerCls = 'border-emerald-400 bg-emerald-500/25 shadow-[0_0_80px_rgba(52,211,153,0.6)]';
  else if (flash === 'red') centerCls = 'border-rose-400 bg-rose-500/25 shadow-[0_0_80px_rgba(244,63,94,0.6)]';
  else if (phase === 'buzzed') centerCls = 'border-amber-300 bg-surface/70 qgs-pulse';

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-6 py-10 text-center">
      {needGate && (
        <button
          onClick={unlock}
          className="fixed inset-0 z-50 flex items-center justify-center bg-surface/90 backdrop-blur-xl text-2xl font-bold"
        >
          🔊 Нажмите, чтобы включить звук
        </button>
      )}

      {state && (
        <div className="mb-6">
          <h1 className="font-display text-3xl font-bold">{state.gameName}</h1>
          {state.total > 0 && (
            <p className="font-mono text-zinc-400 mt-1">{state.currentIndex + 1} / {state.total}</p>
          )}
        </div>
      )}

      {phase === 'lobby' && (
        <div className="flex flex-col items-center">
          <h2 className="font-display text-2xl mb-6">🎤 Сканируй и заходи в игру!</h2>
          {qr && (
            <div className="glass p-4 mb-4">
              <img src={qr} alt="QR" className="w-72 h-72" />
            </div>
          )}
          <div className="text-zinc-400 mb-1">{joinUrl}</div>
          <div className="text-lg">код игры: <b className="text-violet-300 tracking-widest">{state?.code}</b></div>
          {/^(localhost|127\.|172\.(1[6-9]|2\d|3[01])\.)/.test(window.location.hostname) && (
            <div className="mt-3 max-w-md rounded-lg border border-amber-500/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-200">
              Откройте этот экран по IP компьютера в вашей сети (напр. http://192.168.x.x:5173),
              иначе телефоны не смогут подключиться по QR.
            </div>
          )}
          {!!state?.players.length && (
            <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-2xl">
              {state.players.map((p) => (
                <span
                  key={p.id}
                  className={`rounded-full px-3 py-1 text-sm ${
                    p.ready ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-zinc-300'
                  }`}
                >
                  {p.name}{p.ready ? ' ✓' : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {inRound && (
        <div className="relative flex items-center justify-center" style={{ width: 520, height: 520 }}>
          <canvas ref={canvasRef} width={520} height={520} className="absolute inset-0" />
          {/* центральный круг: вопрос → обложка */}
          <div
            className={`relative z-10 flex items-center justify-center rounded-full border-4 transition-all duration-500 overflow-hidden ${centerCls}`}
            style={{ width: 230, height: 230 }}
          >
            {showCover && state?.reveal?.cover ? (
              <img src={state.reveal.cover} alt="" className="qgs-pop h-full w-full object-cover" />
            ) : (
              <span className="font-display text-8xl font-black text-white/90">?</span>
            )}
          </div>
          {/* имя нажавшего под кругом */}
          {phase === 'buzzed' && state?.buzzed && (
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span className="rounded-full bg-amber-400/15 px-4 py-1 text-lg font-bold text-amber-200">
                🔔 {state.buzzed.name}
              </span>
            </div>
          )}
        </div>
      )}

      {phase === 'playing' && <p className="mt-6 text-zinc-400 text-xl">Слушаем… кто угадает?</p>}
      {phase === 'reveal' && state?.reveal && (
        <div className="mt-6">
          <div className="font-display text-3xl font-bold">{state.reveal.title}</div>
          <div className="text-zinc-400 text-xl">{state.reveal.artist}</div>
        </div>
      )}

      {phase === 'finished' && (
        <div className="glass p-8 w-full max-w-md">
          <h2 className="font-display text-3xl font-bold mb-6">🏆 Игра окончена!</h2>
          <div className="space-y-2">
            {[...(state?.players || [])].sort((a, b) => b.score - a.score).map((p, i) => (
              <div
                key={p.id}
                className={`flex justify-between rounded-lg px-4 py-2 ${i === 0 ? 'bg-amber-400/10 text-amber-200' : 'bg-white/5'}`}
              >
                <span>{i + 1}. {p.name}</span>
                <span className="font-bold">{p.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
