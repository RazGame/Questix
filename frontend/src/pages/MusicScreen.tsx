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
  smoothed?: Float32Array;
}

const apiOrigin =
  import.meta.env.VITE_SOCKET_URL ||
  `${window.location.protocol}//${window.location.hostname}:5000`;
const TRACK_FADE_IN_MS = 650;
const ANSWER_RESUME_FADE_IN_MS = 450;
const ANSWER_FADE_OUT_MS = 320;

export default function MusicScreen() {
  const { gameId } = useParams<{ gameId: string }>();
  const engineRef = useRef<AudioEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const audioReadyRef = useRef(false);
  // Отрезок воспроизведения: один проход start→end. Повтор запускает ведущий.
  const segmentRef = useRef<{ start: number; end: number | null; active: boolean; ended: boolean }>({
    start: 0, end: null, active: false, ended: false,
  });
  const pendingPlayRef = useRef<{ fileUrl: string; startSec: number; endSec: number | null; nextUrl?: string | null } | null>(null);
  // Частицы, летящие из центра к краям (создают ощущение энергии наружу).
  const particlesRef = useRef<
    { angle: number; r: number; speed: number; life: number; max: number; w: number }[]
  >([]);

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
    analyser.smoothingTimeConstant = 0.72;
    srcNode.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);
    const finishSegment = () => {
      const segment = segmentRef.current;
      if (!segment.active || segment.ended) return;
      segment.active = false;
      segment.ended = true;
      audio.pause();
      socketRef.current?.emit('screen:ended');
    };
    // Один проход отрезка: при достижении конца ждём решения ведущего.
    audio.addEventListener('timeupdate', () => {
      const segment = segmentRef.current;
      if (segment.active && segment.end && audio.currentTime >= segment.end) {
        finishSegment();
      }
    });
    audio.addEventListener('ended', finishSegment);
    engineRef.current = {
      audio,
      next,
      ctx,
      analyser,
      gain,
      freq: new Uint8Array(analyser.frequencyBinCount),
      minFreq: new Float32Array(analyser.frequencyBinCount).fill(255),
      maxFreq: new Float32Array(analyser.frequencyBinCount).fill(0),
      smoothed: new Float32Array(analyser.frequencyBinCount).fill(0)
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
    audioReadyRef.current = true;
    socketRef.current?.emit('screen:audio-ready');
    setNeedGate(false);
  };

  const playFrom = (fileUrl: string, startSec: number, endSec: number | null, nextUrl?: string | null) => {
    const e = initAudio();
    if (e.ctx.state === 'suspended') e.ctx.resume();
    // Сбросываем калибровку динамического диапазона и сглаживание для нового трека
    if (e.minFreq) e.minFreq.fill(255);
    if (e.maxFreq) e.maxFreq.fill(0);
    if (e.smoothed) e.smoothed.fill(0);
    e.gain.gain.cancelScheduledValues(e.ctx.currentTime);
    e.gain.gain.setValueAtTime(0.0001, e.ctx.currentTime);
    e.gain.gain.linearRampToValueAtTime(1, e.ctx.currentTime + TRACK_FADE_IN_MS / 1000);
    segmentRef.current = { start: startSec || 0, end: endSec, active: true, ended: false };
    const src = apiOrigin + fileUrl;
    if (e.audio.src !== src) {
      e.audio.src = src;
    }
    pendingPlayRef.current = { fileUrl, startSec, endSec, nextUrl };
    try {
      e.audio.currentTime = startSec || 0;
    } catch { /* ignore */ }
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
    segmentRef.current.active = false; // во время доигрыша/фейда не считаем конец отрезка
    const e = engineRef.current;
    if (e) {
      if (e.ctx.state === 'suspended') e.ctx.resume();
      e.gain.gain.cancelScheduledValues(e.ctx.currentTime);
      e.gain.gain.setValueAtTime(0.0001, e.ctx.currentTime);
      e.gain.gain.linearRampToValueAtTime(1, e.ctx.currentTime + ANSWER_RESUME_FADE_IN_MS / 1000);
      if (e.audio.paused) {
        e.audio.play().catch(() => setNeedGate(true));
      }
    }
    setTimeout(() => {
      const current = engineRef.current;
      if (!current) return;
      const now = current.ctx.currentTime;
      current.gain.gain.cancelScheduledValues(now);
      current.gain.gain.setValueAtTime(current.gain.gain.value, now);
      current.gain.gain.linearRampToValueAtTime(0.0001, now + fadeMs / 1000);
      setTimeout(() => current.audio.pause(), fadeMs + 100);
    }, playMs);
  };

  const fadePause = (fadeMs = ANSWER_FADE_OUT_MS) => {
    const e = engineRef.current;
    if (!e || e.audio.paused) return;
    const now = e.ctx.currentTime;
    e.gain.gain.cancelScheduledValues(now);
    e.gain.gain.setValueAtTime(e.gain.gain.value, now);
    e.gain.gain.linearRampToValueAtTime(0.0001, now + fadeMs / 1000);
    window.setTimeout(() => {
      const current = engineRef.current;
      if (!current) return;
      current.audio.pause();
    }, fadeMs + 40);
  };

  const fadeResume = (fadeMs = ANSWER_RESUME_FADE_IN_MS) => {
    const e = engineRef.current;
    if (!e) return;
    if (e.ctx.state === 'suspended') e.ctx.resume();
    segmentRef.current.active = true;
    segmentRef.current.ended = false;
    const now = e.ctx.currentTime;
    e.gain.gain.cancelScheduledValues(now);
    e.gain.gain.setValueAtTime(0.0001, now);
    e.gain.gain.linearRampToValueAtTime(1, now + fadeMs / 1000);
    e.audio.play().catch(() => setNeedGate(true));
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
      const visualGain = playing ? Math.max(0, Math.min(1, e!.gain.gain.value || 0)) : 0;
      let frameMax = 140;
      if (playing) {
        e!.analyser.getByteFrequencyData(e!.freq as any);
        let maxInFrame = 0;
        // Находим пиковое значение по низким и средним частотам для динамической нормализации
        for (let k = 0; k < 24; k++) {
          const val = e!.freq[k] || 0;
          if (val > maxInFrame) maxInFrame = val;
        }
        frameMax = Math.max(140, maxInFrame);
        
        if (Math.random() < 0.01) {
          console.log("VIZ_DEBUG frameMax:", frameMax, "freq:", Array.from(e!.freq).slice(0, 15));
        }
      }
      const bars = 72;

      // Бас → пульсация внутреннего радиуса (кольцо «дышит» наружу),
      // плюс медленное вращение всего кольца для живости.
      let bass = 0;
      if (playing) {
        for (let k = 0; k < 6; k++) bass += e!.freq[k] || 0;
        bass = Math.min(1, bass / 6 / 255) * visualGain;
      }
      const innerR = baseR * (1 + bass * 0.18);
      const rot = Date.now() / 9000;

      for (let i = 0; i < bars; i++) {
        const angle = (i / bars) * Math.PI * 2 - Math.PI / 2 + rot;
        let v: number;
        if (playing) {
          // Зеркальное отображение: левая и правая половины танцуют симметрично
          const halfBars = bars / 2;
          const indexInHalf = i < halfBars ? i : bars - i - 1;
          // Фокусируемся на более динамичном диапазоне частот (басы + средние)
          // Используем степенную функцию, чтобы отдать больше визуального веса басам и средним частотам
          const freqIndex = Math.floor(Math.pow(indexInHalf / halfBars, 1.5) * 24);
          const raw = e!.freq[freqIndex] || 0;
          
          if (e!.minFreq && e!.maxFreq) {
            // Медленно подтягиваем границы друг к другу, чтобы адаптироваться к тихим участкам
            e!.minFreq[freqIndex] = e!.minFreq[freqIndex] * 0.996 + raw * 0.004;
            e!.maxFreq[freqIndex] = e!.maxFreq[freqIndex] * 0.996 + raw * 0.004;
            
            // Если выходим за границы, мгновенно расширяем
            if (raw < e!.minFreq[freqIndex]) e!.minFreq[freqIndex] = raw;
            if (raw > e!.maxFreq[freqIndex]) e!.maxFreq[freqIndex] = raw;
            
            const minVal = e!.minFreq[freqIndex];
            const maxVal = e!.maxFreq[freqIndex];
            const range = maxVal - minVal;
            
            // Добавим 10% отступа (padding) сверху и снизу от реального размаха,
            // чтобы значения не залипали в крайних точках и движение было более плавным.
            const pad = Math.max(5, range * 0.1);
            const minBound = Math.max(0, minVal - pad);
            const maxBound = Math.min(255, maxVal + pad);
            const effectiveRange = maxBound - minBound;
            
            let normalized = effectiveRange > 15 ? (raw - minBound) / effectiveRange : 0;
            normalized = Math.max(0, Math.min(1.0, normalized));
            normalized *= visualGain;
            
            // Плавное накопление энергии/инерции для сглаживания джиттера
            const prevVal = e!.smoothed ? e!.smoothed[i] : 0;
            // Быстрый взлет, медленный спад
            const smoothingFactor = normalized > prevVal ? 0.35 : 0.15;
            let val = prevVal + (normalized - prevVal) * smoothingFactor;
            if (e!.smoothed) e!.smoothed[i] = val;
            
            // Возводим в степень для повышения визуального контраста (тихие звуки уходят вниз, пики выразительны)
            v = Math.pow(val, 1.3);
          } else {
            v = raw / 255;
          }
        } else {
          // тихий «вдох-выдох», когда музыка не играет (баззер)
          v = 0.05 + 0.03 * Math.abs(Math.sin(Date.now() / 700 + i / 4));
        }
        // Даем большой размах движения, увеличивая множитель амплитуды до 0.95
        const len = baseR * (0.05 + v * 0.95);
        const x0 = cx + Math.cos(angle) * innerR;
        const y0 = cy + Math.sin(angle) * innerR;
        const x1 = cx + Math.cos(angle) * (innerR + len);
        const y1 = cy + Math.sin(angle) * (innerR + len);
        const grad = cctx.createLinearGradient(x0, y0, x1, y1);
        if (playing) {
          grad.addColorStop(0, `rgba(139,92,246,${Math.max(0.18, visualGain).toFixed(3)})`);
          grad.addColorStop(1, `rgba(217,70,239,${Math.max(0.18, visualGain).toFixed(3)})`);
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

      // ---- частицы: энергия летит из центра к краям ----
      const particles = particlesRef.current;
      const maxR = Math.min(w, h) * 0.5;
      if (playing) {
        // постоянный поток наружу + всплеск на басах
        const spawn = 2 + Math.round(bass * 6);
        for (let s = 0; s < spawn && particles.length < 220; s++) {
          const a = Math.random() * Math.PI * 2;
          particles.push({
            angle: a,
            r: innerR,
            speed: 3.2 + bass * 6 + Math.random() * 2,
            life: 1,
            max: maxR,
            w: 2 + Math.random() * 2.5,
          });
        }
      }
      for (let p = particles.length - 1; p >= 0; p--) {
        const pt = particles[p];
        pt.r += pt.speed;
        pt.life = 1 - (pt.r - innerR) / (pt.max - innerR);
        if (pt.life <= 0 || pt.r >= pt.max) { particles.splice(p, 1); continue; }
        const px = cx + Math.cos(pt.angle) * pt.r;
        const py = cy + Math.sin(pt.angle) * pt.r;
        // короткий «хвост» по направлению движения
        const tx = cx + Math.cos(pt.angle) * (pt.r - 8);
        const ty = cy + Math.sin(pt.angle) * (pt.r - 8);
        cctx.strokeStyle = `rgba(217,130,250,${(pt.life * 0.8).toFixed(3)})`;
        cctx.lineWidth = pt.w;
        cctx.lineCap = 'round';
        cctx.beginPath();
        cctx.moveTo(tx, ty);
        cctx.lineTo(px, py);
        cctx.stroke();
      }
    };
    draw();
  };
  const stopViz = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    particlesRef.current = [];
  };

  // ---------- сокет ----------
  useEffect(() => {
    if (!gameId) return;
    const socket = createSocket();
    socketRef.current = socket;
    socket.on('connect', () => {
      socket.emit('join', { role: 'screen', gameId });
      if (audioReadyRef.current) socket.emit('screen:audio-ready');
    });
    socket.on('cmd', (m: any) => {
      if (m.action === 'play') playFrom(m.fileUrl, m.startSec, m.endSec ?? null, m.nextUrl);
      else if (m.action === 'pause') fadePause(m.fadeMs);
      else if (m.action === 'resume') {
        fadeResume(m.fadeMs);
      }
      else if (m.action === 'fadeAndStop') fadeAndStop(m.playMs, m.fadeMs);
      else if (m.action === 'stop') {
        segmentRef.current.active = false;
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

  // визуализация активна в игре/баззере/reveal; после конца фрагмента
  // оставляем цикл живым, чтобы кольцо не замерло, а погасло в тихий режим.
  useEffect(() => {
    if (state && ['playing', 'ended', 'buzzed', 'reveal'].includes(state.phase)) startViz();
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
            segmentRef.current.active = true;
            segmentRef.current.ended = false;
            e.audio.play().catch(() => setNeedGate(true));
          }
        } else if (phase === 'buzzed') {
          if (!e.audio.paused) {
            e.audio.pause();
          }
        }
      }
    } else if (phase === 'ended') {
      segmentRef.current.active = false;
      if (!e.audio.paused) {
        e.audio.pause();
      }
    } else if (phase === 'finished' || phase === 'lobby') {
      if (!e.audio.paused) {
        segmentRef.current.active = false;
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
  const inRound = phase === 'playing' || phase === 'ended' || phase === 'buzzed' || phase === 'reveal';

  // классы центрального круга
  let centerCls = 'border-violet-400/50 bg-surface/70';
  if (flash === 'green') centerCls = 'border-emerald-400 bg-emerald-500/25 shadow-[0_0_80px_rgba(52,211,153,0.6)]';
  else if (flash === 'red') centerCls = 'border-rose-400 bg-rose-500/25 shadow-[0_0_80px_rgba(244,63,94,0.6)]';
  else if (phase === 'buzzed') centerCls = 'border-amber-300 bg-surface/70 qgs-pulse';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 text-center">
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
      {phase === 'ended' && <p className="mt-6 text-zinc-400 text-xl">Фрагмент закончился. Ждём ведущего…</p>}
      {phase === 'reveal' && state?.reveal && (
        <div className="mt-6">
          <div className="font-display text-3xl font-bold">{state.reveal.title}</div>
          <div className="text-zinc-400 text-xl">{state.reveal.artist}</div>
        </div>
      )}

      {phase === 'finished' && (
        <div className="glass p-10 w-full max-w-2xl rounded-2xl border border-violet-500/20 bg-surface/80 backdrop-blur-xl shadow-2xl">
          <h2 className="font-display text-4xl font-extrabold mb-8 bg-gradient-to-r from-amber-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
            🏆 Итоговая таблица результатов
          </h2>
          
          {state?.players && state.players.length > 0 ? (
            <div className="space-y-3">
              {[...state.players]
                .sort((a, b) => b.score - a.score)
                .map((p, i) => {
                  let badge = '';
                  let rowClass = 'bg-white/5 border border-white/5';
                  let textClass = 'text-zinc-100';
                  let scoreClass = 'text-violet-300';
                  
                  if (i === 0) {
                    badge = '🥇';
                    rowClass = 'bg-amber-400/10 border border-amber-400/30 shadow-lg shadow-amber-950/20';
                    textClass = 'text-amber-200 text-lg font-bold';
                    scoreClass = 'text-amber-300 text-xl font-extrabold';
                  } else if (i === 1) {
                    badge = '🥈';
                    rowClass = 'bg-zinc-400/10 border border-zinc-400/30';
                    textClass = 'text-zinc-200 text-md font-semibold';
                    scoreClass = 'text-zinc-300 font-bold';
                  } else if (i === 2) {
                    badge = '🥉';
                    rowClass = 'bg-amber-700/10 border border-amber-700/30';
                    textClass = 'text-amber-600/80 text-md';
                    scoreClass = 'text-amber-600 font-bold';
                  }
                  
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between rounded-xl px-6 py-4 transition-all duration-300 ${rowClass}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-8 text-left text-lg font-bold text-zinc-500">
                          {badge || `#${i + 1}`}
                        </span>
                        <span className={textClass}>{p.name}</span>
                      </div>
                      <span className={`font-mono ${scoreClass}`}>{p.score} очков</span>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="py-12 text-center text-zinc-400 text-lg">
              <p>Участники не успели подключиться или набрать очки.</p>
              <p className="text-sm text-zinc-500 mt-2">Запустите новую игру для подключения игроков!</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
