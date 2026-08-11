import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import NoSleep from 'nosleep.js';
import { createSocket } from '../services/socket';
import SongCover from '../components/SongCover';
import { FloatingReactions, ReactionFlyItem } from '../components/FloatingReactions';
import { Leaderboard } from '../components/Leaderboard';
import { musicService, musicCoverSrc, songArtworkSrc } from '../services/music';
import { defaultApiOrigin } from '../../../core/services/apiOrigin';
import { MusicState } from '../../../core/types';

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

/**
 * Проектор не должен прокручиваться никогда: то, что уехало за край, зал
 * просто не увидит. Содержимое рисуется в натуральную величину, и если оно
 * не влезло в окно — целиком ужимается трансформацией. Так спасаются и
 * длинный список блоков, и карточка «нажал первым» на невысоком экране.
 *
 * Оверлеи с position:fixed заворачивать сюда нельзя: трансформация у предка
 * превращает их в absolute. Поэтому они остаются снаружи.
 */
// Воздух под самым нижним вылезающим блоком, в натуральных пикселях
// (масштаб применится к нему вместе со всем содержимым).
const OVERFLOW_GAP = 32;

/**
 * Сколько сверху занимает шапка сайта.
 *
 * Она выведена из потока (`position: absolute`), поэтому в геометрии экрана
 * её не видно: верх контейнера — ноль, будто места над ним нет. На короткой
 * игре это не замечалось (содержимое центрировалось и до шапки не доставало),
 * а на двадцати одном блоке контент растягивался во всю высоту, и название
 * игры оказывалось ровно под логотипом.
 */
function overlayInset() {
  let inset = 0;
  document.querySelectorAll('header, nav').forEach((el) => {
    const pos = getComputedStyle(el).position;
    if (pos !== 'fixed' && pos !== 'absolute') return;
    const r = el.getBoundingClientRect();
    // только то, что реально висит поперёк верхней кромки окна
    if (r.top <= 1 && r.bottom > 0 && r.width > window.innerWidth * 0.5) {
      inset = Math.max(inset, r.bottom);
    }
  });
  return inset;
}

function FitScreen({ children, watch }: { children: React.ReactNode; watch?: string }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  // Над экраном ещё шапка сайта, поэтому 100dvh давал бы «экран + шапка»
  // и страница всё равно прокручивалась. Берём то, что осталось под шапкой.
  const [boxH, setBoxH] = useState<number | null>(null);
  const [inset, setInset] = useState(0);
  const [innerH, setInnerH] = useState<number | null>(null);

  useLayoutEffect(() => {
    const fit = () => {
      const box = boxRef.current;
      const inner = innerRef.current;
      if (!box || !inner) return;
      const avail = Math.max(200, window.innerHeight - box.getBoundingClientRect().top);
      setBoxH((prev) => (prev === null || Math.abs(prev - avail) > 1 ? avail : prev));

      // Полосу под шапкой отдаём ей: она наезжает поверх, а не отодвигает.
      // Отступ задаётся паддингом внутри контейнера, поэтому его собственный
      // top не меняется и следующий замер не уедет.
      const topInset = overlayInset();
      setInset((prev) => (Math.abs(prev - topInset) > 1 ? topInset : prev));
      const usable = Math.max(160, avail - topInset);

      // scrollHeight не учитывает абсолютно позиционированные элементы —
      // например, карточку «нажал первым», которая лежит в секции
      // фиксированной высоты и вылезает за неё. Без этого длинное название
      // команды просто обрезалось нижним краем экрана.
      //
      // Считаем по offsetTop/offsetHeight, а не по getBoundingClientRect:
      // карточка появляется анимацией со scale(0.22), и прямоугольник в этот
      // момент врёт в разы — по нему выходило, что всё помещается, а через
      // полсекунды карточка вырастала и уезжала за край.
      let needed = inner.scrollHeight;
      inner.querySelectorAll<HTMLElement>('[class*="absolute"], [class*="fixed"]').forEach((el) => {
        if (!el.offsetHeight) return;
        let bottom = el.offsetHeight;
        for (let n: HTMLElement | null = el; n && n !== inner; n = n.offsetParent as HTMLElement | null) {
          bottom += n.offsetTop;
        }
        // Запас снизу: раз высоту задаёт именно этот блок, без него он
        // ужимается ровно до края экрана и выглядит приклеенным.
        needed = Math.max(needed, bottom + OVERFLOW_GAP);
      });

      // Контейнер должен ЗНАТЬ про вылезающую карточку: иначе он центрирует
      // свою (меньшую) высоту, и низ карточки всё равно уходит за край.
      setInnerH((prev) => (prev === null || Math.abs(prev - needed) > 1 ? needed : prev));

      const k = Math.min(
        1,
        usable / Math.max(1, needed),
        box.clientWidth / Math.max(1, inner.scrollWidth)
      );
      setScale((prev) => (Math.abs(prev - k) > 0.005 ? k : prev));
    };
    fit();
    // Карточка «нажал первым» появляется абсолютным блоком: размер контейнера
    // при этом не меняется, и ResizeObserver молчит. Поэтому пересчитываем
    // ещё и по watch — строке, которая меняется вместе с фазой и карточкой.
    const t = window.setTimeout(fit, 60); // после анимации появления
    const ro = new ResizeObserver(fit);
    if (innerRef.current) ro.observe(innerRef.current);
    if (boxRef.current) ro.observe(boxRef.current);
    window.addEventListener('resize', fit);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [watch]);

  return (
    <div
      ref={boxRef}
      className="flex w-full items-center justify-center overflow-hidden"
      style={{ height: boxH ? `${boxH}px` : '100dvh', paddingTop: inset ? `${inset}px` : undefined }}
    >
      <div
        ref={innerRef}
        className="w-full"
        style={{
          ...(innerH ? { minHeight: `${innerH}px` } : {}),
          ...(scale < 1 ? { transform: `scale(${scale})`, transformOrigin: 'center center' } : {}),
        }}
      >
        {children}
      </div>
    </div>
  );
}

const apiOrigin = import.meta.env.VITE_SOCKET_URL || defaultApiOrigin();
const TRACK_FADE_IN_MS = 1200; // мягкий вход трека (после заставок обрыв тишина→звук режет слух)
const ANSWER_RESUME_FADE_IN_MS = 450;
const ANSWER_FADE_OUT_MS = 320;
const SEGMENT_FADE_OUT_MS = 1200; // затухание в конце отрезка вместо обрыва

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
  // Узел обратного воспроизведения: <audio> задом наперёд не умеет, поэтому
  // отрезок декодируется в буфер и разворачивается по сэмплам.
  const reverseNodeRef = useRef<AudioBufferSourceNode | null>(null);
  // Частицы, летящие из центра к краям (создают ощущение энергии наружу).
  const particlesRef = useRef<
    { angle: number; r: number; speed: number; life: number; max: number; w: number }[]
  >([]);

  const [needGate, setNeedGate] = useState(true);
  const [state, setState] = useState<MusicState | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState('');
  const [flyReactions, setFlyReactions] = useState<ReactionFlyItem[]>([]);
  // Анимации центра: вспышка верно/неверно и показ обложки.
  const [flash, setFlash] = useState<'green' | 'red' | null>(null);
  const [showCover, setShowCover] = useState(false);
  const [coverLeaving, setCoverLeaving] = useState(false);
  // Запоминаем, что показывали: state.reveal обнуляется сразу при смене фазы,
  // и без этого уезжать было бы уже нечему.
  const [lastCover, setLastCover] = useState<{ cover?: string; songId?: string | null }>({});
  // Обложка уезжает с анимацией, а не пропадает в один кадр. Снимаем её
  // только после проигрыша ухода, иначе «?» возвращается рывком.
  const hideCover = () => {
    setShowCover((visible) => {
      if (!visible) return false;
      setCoverLeaving(true);
      setTimeout(() => { setShowCover(false); setCoverLeaving(false); }, 340);
      return true;
    });
  };
  const [buzzCard, setBuzzCard] = useState<{
    id: string;
    name: string;
    by?: string;
    answer?: string; // выбранный вариант в блице
    team: boolean;
    leaving: boolean;
  } | null>(null);
  const prevPhase = useRef<string | null>(null);
  // Обратный отсчёт интро-заставок (список блоков / анонс нового блока).
  const [introLeft, setIntroLeft] = useState<number | null>(null);
  // Подсказка обложкой: 0 — сплошное пятно, 1 — картинка целиком.
  const [hint, setHint] = useState(0);

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
      // Плавное затухание вместо обрыва. Серверу сообщаем сразу — ведущий
      // видит «фрагмент закончился», пока звук ещё догасает.
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0.0001, now + SEGMENT_FADE_OUT_MS / 1000);
      window.setTimeout(() => {
        // если за время фейда ведущий уже включил повтор/доигрыш — не трогаем
        if (!segmentRef.current.active) audio.pause();
      }, SEGMENT_FADE_OUT_MS + 60);
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

  // Обложку тянем в кэш, как только песня зазвучала: в общем состоянии она
  // появляется лишь в момент раскрытия, и без этого картинка догружалась уже
  // после вспышки — зал видел пустой круг. Ссылки те же, что нарисует
  // SongCover, поэтому браузер отдаст их из кэша мгновенно.
  const preloadCover = (cover?: string, songId?: string) => {
    for (const url of [musicCoverSrc(cover, 'lg'), songArtworkSrc(songId)]) {
      if (url) new Image().src = url;
    }
  };

  // Экран проектора не должен гаснуть посреди игры (ноутбук без питания и т.п.).
  const noSleepRef = useRef<NoSleep | null>(null);
  useEffect(() => () => { try { noSleepRef.current?.disable(); } catch { /* ignore */ } }, []);

  // Аудио-движок закрываем при уходе со страницы. Браузер держит лимит
  // одновременных AudioContext (в Chrome их около шести): без закрытия
  // повторные открытия окна проектора копили их, и в какой-то момент звук
  // просто переставал появляться.
  useEffect(() => () => {
    stopReverse();
    const e = engineRef.current;
    engineRef.current = null;
    if (!e) return;
    try {
      e.audio.pause(); e.audio.src = '';
      e.next.pause(); e.next.src = '';
      e.analyser.disconnect();
      e.gain.disconnect();
      if (e.ctx.state !== 'closed') void e.ctx.close();
    } catch { /* страница всё равно уходит */ }
  }, []);

  const unlock = () => {
    try {
      if (!noSleepRef.current) noSleepRef.current = new NoSleep();
      if (!noSleepRef.current.isEnabled) {
        void noSleepRef.current.enable().catch(() => {
          // Если браузер отказал в wake lock, звук и игра всё равно продолжаются.
        });
      }
    } catch { /* не поддерживается — не критично */ }
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

  const stopReverse = () => {
    const node = reverseNodeRef.current;
    reverseNodeRef.current = null;
    if (!node) return;
    try { node.onended = null; node.stop(); } catch { /* уже остановлен */ }
  };

  /**
   * Отрезок задом наперёд. Тег <audio> отрицательную скорость не поддерживает
   * (и не будет), поэтому единственный путь — decodeAudioData, развернуть
   * сэмплы и проиграть буфером. Идём в тот же analyser, чтобы эквалайзер на
   * проекторе продолжал жить.
   */
  const playReversed = async (fileUrl: string, startSec: number, endSec: number | null) => {
    const e = initAudio();
    if (e.ctx.state === 'suspended') await e.ctx.resume();
    stopReverse();
    e.audio.pause();

    const raw = await fetch(apiOrigin + fileUrl).then((r) => r.arrayBuffer());
    const decoded = await e.ctx.decodeAudioData(raw);
    const from = Math.max(0, startSec || 0);
    const to = Math.min(decoded.duration, endSec ?? decoded.duration);
    const rate = decoded.sampleRate;
    const length = Math.max(1, Math.floor((to - from) * rate));
    const offset = Math.floor(from * rate);

    const out = e.ctx.createBuffer(decoded.numberOfChannels, length, rate);
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      const src = decoded.getChannelData(ch);
      const dst = out.getChannelData(ch);
      for (let i = 0; i < length; i++) dst[i] = src[offset + length - 1 - i] || 0;
    }

    const node = e.ctx.createBufferSource();
    node.buffer = out;
    node.connect(e.analyser);
    // Отрезок кончился — сообщаем серверу тем же событием, что и обычный путь
    node.onended = () => {
      if (reverseNodeRef.current === node) {
        reverseNodeRef.current = null;
        socketRef.current?.emit('screen:ended');
      }
    };
    e.gain.gain.cancelScheduledValues(e.ctx.currentTime);
    e.gain.gain.setValueAtTime(0.0001, e.ctx.currentTime);
    e.gain.gain.linearRampToValueAtTime(1, e.ctx.currentTime + TRACK_FADE_IN_MS / 1000);
    reverseNodeRef.current = node;
    node.start();
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
      if (playing) {
        // Снимаем спектр кадра — дальше его читают расчёты баса и столбиков.
        e!.analyser.getByteFrequencyData(e!.freq as any);
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
      if (m.action === 'play') {
        if (m.reverse) {
          void playReversed(m.fileUrl, m.startSec, m.endSec ?? null).catch(() => {
            // не смогли развернуть — играем как обычно, раунд важнее эффекта
            playFrom(m.fileUrl, m.startSec, m.endSec ?? null, m.nextUrl);
          });
        } else {
          stopReverse();
          playFrom(m.fileUrl, m.startSec, m.endSec ?? null, m.nextUrl);
        }
        preloadCover(m.cover, m.songId);
      }
      else if (m.action === 'pause') { stopReverse(); fadePause(m.fadeMs); }
      else if (m.action === 'resume') {
        fadeResume(m.fadeMs);
      }
      else if (m.action === 'playOn') {
        // Доигрываем дальше: снимаем ограничение отрезка и продолжаем с места остановки.
        segmentRef.current.end = null;
        fadeResume(m.fadeMs);
      }
      else if (m.action === 'fadeAndStop') { stopReverse(); fadeAndStop(m.playMs, m.fadeMs); }
      else if (m.action === 'stop') {
        segmentRef.current.active = false;
        stopReverse();
        const e = engineRef.current;
        if (e) { e.audio.pause(); e.audio.currentTime = 0; }
      }
    });
    socket.on('reaction:fly', (data: any) => {
      // Разброс считаем один раз при получении: если делать это на рендере,
      // траектория будет прыгать при каждой перерисовке экрана.
      const durMs = 3200 + Math.floor(Math.random() * 1400);
      const swayMs = 1500 + Math.floor(Math.random() * 900);
      const item: ReactionFlyItem = {
        id: data.id || `${Date.now()}-${Math.random()}`,
        emoji: data.emoji,
        senderName: data.senderName,
        // Держим подальше от краёв: элемент растёт вправо от своей точки,
        // и с длинным именем у самого края подпись обрезалась бы.
        leftPct: 8 + Math.floor(Math.random() * 70),
        // Размах небольшой: качание в стороны — это лёгкий дрейф, а не
        // маятник, иначе движение читается как рывки.
        swayPx: 8 + Math.floor(Math.random() * 10),
        swayMs,
        swayDelayMs: Math.floor(Math.random() * swayMs),
        risePct: 55 + Math.floor(Math.random() * 22),
        durMs,
      };
      // Больше дюжины разом — уже каша: держим последние и снимаем каждую
      // ровно по окончании её собственной анимации.
      setFlyReactions((prev) => [...prev.slice(-11), item]);
      window.setTimeout(() => {
        setFlyReactions((prev) => prev.filter((r) => r.id !== item.id));
      }, durMs + 120);
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

  // Отсчёт до конца интро: сервер шлёт остаток (introMs), тикаем локально.
  // На паузе отсчёт замирает — сервер заморозил таймер и пришлёт новый остаток.
  useEffect(() => {
    const ms = state?.introMs ?? null;
    setIntroLeft(ms);
    if (ms == null || state?.paused) return;
    const startedAt = Date.now();
    const t = setInterval(() => {
      setIntroLeft(Math.max(0, ms - (Date.now() - startedAt)));
    }, 200);
    return () => clearInterval(t);
  }, [state?.introMs, state?.paused, state?.phase]);

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

      if (phase === 'playing' && state.paused) {
        // Пауза ведущего: не даём синхронизации перезапустить звук.
        segmentRef.current.active = false;
        if (!e.audio.paused) e.audio.pause();
      } else if (cleanSrc !== targetClean) {
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
    } else if (phase === 'finished' || phase === 'lobby' || phase === 'intro' || phase === 'blockIntro') {
      if (!e.audio.paused) {
        segmentRef.current.active = false;
        e.audio.pause();
        e.audio.currentTime = 0;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, state?.fileUrl, state?.paused, needGate]);

  // Обложка проявляется по ходу отрезка: к концу её уже почти видно, но
  // угадать раньше — честнее и приятнее. Считаем от позиции звука, а не от
  // таймера: тогда пауза и «включить ещё раз» не сбивают подсказку.
  useEffect(() => {
    if (!state?.coverHint || state.phase !== 'playing') {
      setHint(0);
      return;
    }
    const id = window.setInterval(() => {
      const e = engineRef.current;
      const from = state.startSec || 0;
      const to = state.endSec ?? (from + 30);
      const span = Math.max(1, to - from);
      const now = e ? e.audio.currentTime : from;
      setHint(Math.max(0, Math.min(1, (now - from) / span)));
    }, 200);
    return () => window.clearInterval(id);
  }, [state?.coverHint, state?.phase, state?.startSec, state?.endSec]);

  // анимации центра по сменам фаз
  useEffect(() => {
    const phase = state?.phase || null;
    const prev = prevPhase.current;
    if (phase !== prev) {
      if (phase === 'reveal') {
        // Верный ответ — зелёная вспышка. Если ответ раскрыл ведущий
        // (никто не угадал) — вспышки нет, просто показываем обложку.
        if (state?.revealGuessed !== false) {
          setFlash('green');
          setTimeout(() => setFlash(null), 1100);
        }
        setCoverLeaving(false);
        setLastCover({ cover: state?.reveal?.cover, songId: state?.currentSongId });
        setShowCover(false);
        setTimeout(() => setShowCover(true), 450);
      } else if (prev === 'buzzed' && phase === 'playing') {
        // неверный ответ: красная вспышка и возврат
        setFlash('red');
        setTimeout(() => setFlash(null), 800);
      } else if (phase === 'playing') {
        hideCover();
        setFlash(null);
      } else if (phase === 'lobby' || phase === 'finished') {
        hideCover();
        setFlash(null);
      } else if (prev === 'reveal') {
        // Ушли с раскрытия куда-то ещё (анонс блока, конец игры) — обложка
        // должна уехать так же плавно, как появилась.
        hideCover();
      }
      prevPhase.current = phase;
    }
  }, [state?.phase]);

  useEffect(() => {
    if (state?.phase === 'buzzed' && state.buzzed) {
      setBuzzCard({
        id: state.buzzed.id,
        name: state.buzzed.name,
        by: state.buzzed.by,
        answer: state.buzzed.answer,
        team: state.mode === 'team',
        leaving: false,
      });
      return;
    }

    setBuzzCard((prev) => (prev && !prev.leaving ? { ...prev, leaving: true } : prev));
    const t = setTimeout(() => {
      setBuzzCard((prev) => (prev?.leaving ? null : prev));
    }, 360);
    return () => clearTimeout(t);
  }, [state?.phase, state?.buzzed?.id, state?.buzzed?.name, state?.buzzed?.by, state?.mode]);

  const phase = state?.phase;
  const inRound = phase === 'playing' || phase === 'ended' || phase === 'buzzed' || phase === 'reveal';
  const displayRound =
    state && state.total > 0
      ? Math.min(Math.max(state.currentIndex + 1, 1), state.total)
      : 0;
  const displayBlockRound =
    state && (state.blockTotal || 0) > 0
      ? Math.min(Math.max((state.blockCurrentIndex ?? 0) + 1, 1), state.blockTotal || 1)
      : 0;

  // Итоговая таблица: по командам (team) или по игрокам (solo).
  const standings =
    state?.mode === 'team'
      ? (state.teams || []).map((t) => ({ id: t.id, name: `👥 ${t.name}`, score: t.score }))
      : (state?.players || []).map((p) => ({ id: p.id, name: p.name, score: p.score }));

  // классы центрального круга
  let centerCls = 'border-violet-400/50 bg-surface/70';
  if (flash === 'green') centerCls = 'border-emerald-400 bg-emerald-500/25 shadow-[0_0_80px_rgba(52,211,153,0.6)]';
  else if (flash === 'red') centerCls = 'border-rose-400 bg-rose-500/25 shadow-[0_0_80px_rgba(244,63,94,0.6)]';
  else if (phase === 'buzzed') centerCls = 'border-amber-300 bg-surface/70 qgs-pulse';

  const THEME_STYLES = {
    classic: '',
    cyberpunk: 'bg-[#06030e] text-cyan-200 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-fuchsia-950/40 via-cyan-950/20 to-black min-h-screen',
    party: 'bg-[#0f0701] text-amber-100 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-amber-600/25 via-purple-950/30 to-black min-h-screen',
    synthwave: 'bg-[#0f001c] text-pink-200 bg-[linear-gradient(to_bottom,_#1f0036_0%,_#3a003f_40%,_#090014_100%)] min-h-screen',
  };

  if (inRound) {
    return (
      <div className={THEME_STYLES[state?.screenTheme || 'classic']}>
        {needGate && (
          <button
            onClick={unlock}
            className="fixed inset-0 z-50 flex items-center justify-center bg-surface/90 backdrop-blur-xl text-2xl font-bold"
          >
            🔊 Нажмите, чтобы включить звук
          </button>
        )}

        {state?.paused && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="text-center">
              <div className="text-7xl mb-4">⏸</div>
              <p className="font-display text-5xl font-extrabold text-white">Пауза</p>
              <p className="mt-3 text-xl text-zinc-400">Игру продолжит ведущий</p>
            </div>
          </div>
        )}
      <FitScreen watch={`${phase}|${buzzCard?.id || ''}|${buzzCard?.answer || ''}|${buzzCard?.name.length || 0}`}>
      <div className="px-6 py-4 text-center">

        <main className="qgs-fade-in mx-auto grid min-h-[calc(100vh-2rem)] max-w-5xl grid-rows-[220px_520px_160px] items-center justify-items-center">
          <section className="flex flex-col items-center justify-center gap-2.5 self-end pb-6">
            {state && (
              <>
                {/* Служебная строка: игра + сквозной счётчик, приглушённо */}
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
                  {state.gameName}
                  {state.total > 0 ? ` · песня ${displayRound} из ${state.total}` : ''}
                </p>
                {/* Герой шапки — название блока (обычный регистр, крупно) */}
                {state.blockName ? (
                  <h1 className="font-display max-w-3xl text-4xl font-extrabold leading-tight text-white">
                    {state.blockName}
                  </h1>
                ) : (
                  <h1 className="font-display text-4xl font-extrabold leading-tight text-white">
                    {state.gameName}
                  </h1>
                )}
                {/* Позиция в блоке: точки, если песен немного, иначе компактный чип */}
                {state.blockName && (state.blockTotal || 0) > 0 && (
                  (state.blockTotal || 0) <= 16 ? (
                    <div className="mt-1 flex items-center gap-2">
                      {Array.from({ length: state.blockTotal || 0 }).map((_, i) => {
                        const cur = state.blockCurrentIndex ?? 0;
                        const role = i === cur ? 'cur' : i < cur ? 'done' : 'todo';
                        return (
                          <span
                            // key с ролью: при смене песни точка перемонтируется
                            // и «выпрыгивает» через qgs-pop
                            key={`${i}-${role}`}
                            className={`rounded-full transition-all duration-300 ${
                              role === 'cur'
                                ? 'qgs-pop h-2.5 w-2.5 bg-fuchsia-400 shadow-[0_0_10px_rgba(217,70,239,0.8)]'
                                : role === 'done'
                                  ? 'h-2 w-2 bg-violet-400/60'
                                  : 'h-2 w-2 bg-white/15'
                            }`}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-1 rounded-full bg-white/5 px-3 py-1 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      В блоке {displayBlockRound} из {state.blockTotal}
                    </p>
                  )
                )}
              </>
            )}
          </section>

          <section className="relative flex items-center justify-center" style={{ width: 520, height: 520 }}>
            <canvas ref={canvasRef} width={520} height={520} className="absolute inset-0" />
            <div
              className={`relative z-10 flex items-center justify-center rounded-full border-4 transition-all duration-500 overflow-hidden ${centerCls}`}
              style={{ width: 230, height: 230 }}
            >
              {/* Ни ссылки, ни файла — оставляем прежний крупный «?», он на
                  проекторе читается лучше значка */}
              {showCover && (lastCover.cover || lastCover.songId) ? (
                <SongCover
                  cover={lastCover.cover}
                  songId={lastCover.songId}
                  size="lg"
                  className={`h-full w-full object-cover ${coverLeaving ? 'qgs-pop-out' : 'qgs-pop'}`}
                />
              ) : state?.coverHint && phase === 'playing' && state.currentSongId ? (
                /* Режим подсказки: обложка уже здесь, но за размытием, которое
                   тает по ходу отрезка. Знак вопроса тускнеет ей навстречу. */
                <>
                  <SongCover
                    cover={undefined}
                    songId={state.currentSongId}
                    size="lg"
                    className="absolute inset-0 h-full w-full object-cover transition-all duration-500"
                    style={{
                      filter: `blur(${Math.max(0, 34 * (1 - hint))}px) saturate(${0.4 + 0.6 * hint})`,
                      transform: `scale(${1.15 - 0.15 * hint})`,
                      opacity: 0.35 + 0.65 * hint,
                    }}
                  />
                  <span
                    className="font-display relative z-10 text-8xl font-black text-white/90 transition-opacity duration-500"
                    style={{ opacity: Math.max(0, 1 - hint * 1.4) }}
                  >
                    ?
                  </span>
                </>
              ) : (
                <span className="font-display text-8xl font-black text-white/90">?</span>
              )}
            </div>
          </section>

          <section className="relative flex h-40 w-full items-start justify-center pt-2">
            {buzzCard && (
              <div
                className={`absolute top-2 left-1/2 z-20 w-[min(760px,92vw)] px-4 ${
                  buzzCard.leaving ? 'qgs-buzz-card-out' : 'qgs-buzz-card-in'
                }`}
              >
                <div className="mx-auto rounded-3xl border border-amber-300/30 bg-surface/85 px-8 py-5 shadow-2xl shadow-amber-950/40 backdrop-blur-md">
                  <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.36em] text-amber-200/80">
                    Нажал первым
                  </p>
                  {/* Длинные названия вылезали за карточку: ужимаем шрифт по
                      длине и переносим по буквам. */}
                  <p
                    className={`font-display font-black leading-tight text-amber-100 drop-shadow-[0_0_28px_rgba(251,191,36,0.45)] break-words ${
                      buzzCard.name.length > 24 ? 'text-3xl'
                        : buzzCard.name.length > 14 ? 'text-4xl' : 'text-5xl'
                    }`}
                  >
                    🔔 {buzzCard.name}
                  </p>
                  {buzzCard.team && buzzCard.by && (
                    <p className="mt-3 text-xl font-bold text-amber-200/90">
                      Кнопку нажал: {buzzCard.by}
                    </p>
                  )}
                  {buzzCard.answer && (
                    <p className="mt-3 text-2xl font-black text-amber-50">
                      «{buzzCard.answer}»
                    </p>
                  )}
                </div>
              </div>
            )}

            {phase === 'playing' && !buzzCard && <p className="text-zinc-400 text-xl">Слушаем… кто угадает?</p>}
            {phase === 'ended' && !buzzCard && <p className="text-zinc-400 text-xl">Фрагмент закончился. Ждём ведущего…</p>}
            {phase === 'reveal' && state?.reveal && !buzzCard && (
              <div>
                {state.revealGuessed === false && (
                  <div className="mb-1 text-lg font-semibold uppercase tracking-[0.2em] text-violet-300">
                    Никто не угадал
                  </div>
                )}
                <div className="font-display text-3xl font-bold">{state.reveal.title}</div>
                <div className="text-zinc-400 text-xl">{state.reveal.artist}</div>
              </div>
            )}
          </section>
        </main>
      </div>
      </FitScreen>
      <FloatingReactions reactions={flyReactions} />
      </div>
    );
  }

  return (
    <div className={THEME_STYLES[state?.screenTheme || 'classic']}>
      {needGate && (
        <button
          onClick={unlock}
          className="fixed inset-0 z-50 flex items-center justify-center bg-surface/90 backdrop-blur-xl text-2xl font-bold"
        >
          🔊 Нажмите, чтобы включить звук
        </button>
      )}
      <FitScreen watch={`${phase}|${state?.teams?.length || 0}|${state?.blocks?.length || 0}`}>
      <div className="flex flex-col items-center justify-center px-6 py-6 text-center">

      {state?.paused && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="text-center">
            <div className="text-7xl mb-4">⏸</div>
            <p className="font-display text-5xl font-extrabold text-white">Пауза</p>
            <p className="mt-3 text-xl text-zinc-400">Игру продолжит ведущий</p>
          </div>
        </div>
      )}

      {state && (
        <div className="mb-7 flex flex-col items-center gap-2">
          <h1 className="font-display text-3xl font-extrabold leading-tight text-white">
            {state.gameName}
          </h1>
          {state.total > 0 && (
            <p className="font-mono text-sm font-semibold uppercase tracking-[0.22em] text-zinc-400">
              Песня {displayRound} из {state.total}
            </p>
          )}
          {inRound && state.blockName && (
            <div className="mt-2 flex flex-col items-center gap-1">
              <p className="text-sm font-extrabold uppercase tracking-[0.24em] text-violet-300">
                {state.blockName}
              </p>
              {(state.blockTotal || 0) > 0 && (
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  В блоке {displayBlockRound} из {state.blockTotal}
                </p>
              )}
            </div>
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
          {/* Предупреждение смотрит на сам адрес входа, а не на то, как открыт
              проектор: LAN-адрес приходит с сервера, и по localhost QR обычно
              всё равно рабочий. Плашка остаётся только на тот случай, когда
              сервер адрес не отдал и в QR действительно уехал localhost. */}
          {/^https?:\/\/(localhost|127\.)/.test(joinUrl) && (
            <div className="mt-3 max-w-md rounded-lg border border-amber-500/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-200">
              Не удалось определить адрес компьютера в сети — по этому QR телефоны
              не подключатся. Откройте экран по IP (напр. http://192.168.x.x:5173).
            </div>
          )}
          {state?.mode === 'team' && !!state?.teams?.length && (
            <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-2xl">
              {state.teams.map((t) => (
                <span
                  key={t.id}
                  className={`rounded-full px-3 py-1 text-sm ${
                    t.ready > 0 ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-zinc-300'
                  }`}
                >
                  👥 {t.name} · {t.online}{t.ready > 0 ? ` ✓${t.ready}` : ''}
                </span>
              ))}
            </div>
          )}
          {state?.mode !== 'team' && !!state?.players.length && (
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

      {phase === 'standings' && (() => {
        // Перерыв между блоками: показываем, кто как идёт. Считаем по тем же
        // правилам, что и финал, — в команде очки общие.
        const rows = state?.mode === 'team'
          ? [...(state.teams || [])].sort((a, b) => b.score - a.score)
              .map((t) => ({ id: t.id, name: t.name, score: t.score }))
          : [...(state?.players || [])].sort((a, b) => b.score - a.score)
              .map((p) => ({ id: p.id, name: p.name, score: p.score }));
        return (
          <div className="qgs-fade-in flex w-full flex-col items-center">
            <p className="mb-2 text-sm font-extrabold uppercase tracking-[0.3em] text-violet-300">
              Промежуточные итоги
            </p>
            <h2 className="font-display mb-6 bg-gradient-to-r from-amber-300 via-violet-300 to-fuchsia-300 bg-clip-text text-4xl font-black text-transparent">
              Как идут дела
            </h2>
            {rows.length === 0 ? (
              <p className="text-lg text-zinc-400">Счёт ещё не открыт.</p>
            ) : (
              <Leaderboard rows={rows} />
            )}
            {introLeft != null && !state?.paused && (
              <p className="mt-6 font-mono text-lg text-zinc-400">
                Следующий блок через <span className="font-bold text-violet-300">{Math.max(1, Math.ceil(introLeft / 1000))}</span>…
              </p>
            )}
          </div>
        );
      })()}

      {(phase === 'intro' || phase === 'blockIntro') && (() => {
        const blocks = state?.blocks || [];
        // Три ступени плотности: на 20 блоках двух колонок уже не хватало —
        // список уезжал за нижний край проектора.
        // Мельчить не нужно: FitScreen сам ужмёт заставку, если она не влезет.
        // Раньше на 20 блоках включались три колонки мелким шрифтом, и список
        // читался с трудом при половине пустого экрана.
        const dense = blocks.length > 24;
        const compact = blocks.length > 5;
        return (
          <div className={`qgs-fade-in flex w-full flex-col items-center ${
            dense ? 'max-w-6xl' : compact ? 'max-w-5xl' : 'max-w-2xl'
          }`}>
            <p className="mb-3 text-sm font-extrabold uppercase tracking-[0.3em] text-violet-300">
              {phase === 'intro' ? 'Блоки игры' : 'Новый блок'}
            </p>
            {phase === 'blockIntro' && (
              <h2 className={`font-display bg-gradient-to-r from-violet-300 via-fuchsia-300 to-amber-200 bg-clip-text font-black text-transparent ${
                compact ? 'mb-5 text-4xl' : 'mb-8 text-5xl'
              }`}>
                {state?.blockName}
              </h2>
            )}
            <div className={`w-full ${
              dense ? 'grid grid-cols-3 gap-x-3 gap-y-1.5' : compact ? 'grid grid-cols-2 gap-2.5' : 'space-y-3'
            }`}>
              {blocks.map((b, i) => {
                const isCurrent = b === state?.blockName;
                return (
                  <div
                    key={`${b}-${i}`}
                    className={`flex items-center rounded-xl border text-left transition ${
                      dense ? 'gap-2 px-3 py-1.5' : compact ? 'gap-3 px-5 py-3' : 'gap-4 px-6 py-4'
                    } ${
                      isCurrent
                        ? 'border-violet-400/50 bg-violet-500/15 shadow-lg shadow-violet-950/40'
                        : 'border-white/5 bg-white/[0.03]'
                    }`}
                  >
                    <span className={`shrink-0 font-mono font-bold ${
                      dense ? 'text-xs' : compact ? 'text-base' : 'text-lg'
                    } ${isCurrent ? 'text-violet-300' : 'text-zinc-500'}`}>
                      {i + 1}
                    </span>
                    <span
                      title={b}
                      className={`min-w-0 flex-1 font-display font-bold ${
                        dense ? 'truncate text-sm leading-snug' : compact ? 'text-xl leading-snug' : 'text-2xl'
                      } ${isCurrent ? 'text-white' : 'text-zinc-300'}`}
                    >
                      {b}
                    </span>
                    {isCurrent && (
                      <span className={`ml-auto shrink-0 rounded-full bg-violet-400/20 font-bold uppercase tracking-wider text-violet-200 ${
                        dense ? 'px-1.5 py-0 text-[9px]' : compact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'
                      }`}>
                        {phase === 'intro' ? 'первый блок' : 'следующий'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {introLeft != null && !state?.paused && (
              <p className={`font-mono text-lg text-zinc-400 ${dense ? 'mt-4' : compact ? 'mt-5' : 'mt-8'}`}>
                Начинаем через <span className="font-bold text-violet-300">{Math.max(1, Math.ceil(introLeft / 1000))}</span>…
              </p>
            )}
          </div>
        );
      })()}

      {phase === 'finished' && (
        <div className="glass w-full max-w-[94rem] rounded-2xl border border-violet-500/20 bg-surface/80 p-10 shadow-2xl backdrop-blur-xl">
          <h2 className="font-display mb-8 bg-gradient-to-r from-amber-300 via-violet-300 to-fuchsia-300 bg-clip-text text-4xl font-extrabold text-transparent">
            🏆 Итоговая таблица результатов
          </h2>

          {standings.length > 0 ? (
            <div className="flex justify-center">
              <Leaderboard rows={standings} />
            </div>
          ) : (
            <div className="py-12 text-center text-lg text-zinc-400">
              <p>Участники не успели подключиться или набрать очки.</p>
              <p className="mt-2 text-sm text-zinc-500">Запустите новую игру для подключения игроков!</p>
            </div>
          )}
        </div>
      )}
      </div>
      </FitScreen>
      <FloatingReactions reactions={flyReactions} />

    </div>
  );
}
