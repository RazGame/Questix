import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import NoSleep from 'nosleep.js';
import { createSocket } from '../services/socket';
import { musicCoverSrc, musicService } from '../services/music';
import { MusicState } from '../types';

const vibrate = (pattern: number | number[]) => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(0);
    navigator.vibrate(pattern);
  }
};

// Телефон игрока «Угадай мелодию». Без регистрации на платформе: вход по коду/QR.
// Баззер на onPointerDown ради минимальной задержки.
export default function MusicPlay() {
  const [params] = useSearchParams();
  const codeFromUrl = (params.get('code') || '').toUpperCase();

  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const prevStateRef = useRef<MusicState | null>(null);
  const autoJoinTriedRef = useRef(false);
  const joinedRef = useRef(false);
  const joinedCodeRef = useRef(codeFromUrl);
  const joinedNameRef = useRef(localStorage.getItem('qgs_name') || '');

  // Не даём телефону заснуть во время игры: погасший экран = отвал сокета
  // и проигранная гонка за баззер. Wake Lock API недоступен по http (LAN),
  // поэтому NoSleep (скрытое видео). Включается только из жеста пользователя.
  const noSleepRef = useRef<NoSleep | null>(null);
  const keepAwake = () => {
    try {
      if (!noSleepRef.current) noSleepRef.current = new NoSleep();
      if (!noSleepRef.current.isEnabled) {
        void noSleepRef.current.enable().catch(() => {
          // Браузер может отказать без пользовательского жеста; следующий tap попробует снова.
        });
      }
    } catch { /* не поддерживается — не мешаем игре */ }
  };
  useEffect(() => () => { try { noSleepRef.current?.disable(); } catch { /* ignore */ } }, []);

  const [code, setCode] = useState(codeFromUrl);
  const [name, setName] = useState(localStorage.getItem('qgs_name') || '');
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');
  const [state, setState] = useState<MusicState | null>(null);
  // Режим входа игры: open (по имени) или required (по аккаунту). null — пока грузим мету.
  const [authMode, setAuthMode] = useState<'open' | 'required' | null>(codeFromUrl ? null : 'open');
  const token = localStorage.getItem('token');
  let storedUser: { nickname?: string } | null = null;
  try { storedUser = JSON.parse(localStorage.getItem('user') || 'null'); } catch { storedUser = null; }
  const needsLogin = authMode === 'required' && !token;

  // Узнаём режим входа по коду (публично, без токена).
  useEffect(() => {
    if (!codeFromUrl) return;
    musicService
      .publicMeta(codeFromUrl)
      .then((m) => setAuthMode(m.auth))
      .catch(() => setAuthMode('open'));
  }, [codeFromUrl]);

  const pidKey = (c: string) => `qgs_pid_${c}`;
  const emitJoin = (targetCode: string, targetName: string) => {
    joinedCodeRef.current = targetCode;
    joinedNameRef.current = targetName;
    const savedPid = localStorage.getItem(pidKey(targetCode));
    playerIdRef.current = savedPid;
    socketRef.current?.emit('join', {
      role: 'player',
      code: targetCode,
      name: targetName,
      playerId: savedPid,
    });
  };

  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyHeight = document.body.style.height;
    const originalBodyPosition = document.body.style.position;
    const originalBodyWidth = document.body.style.width;

    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalHtmlHeight = document.documentElement.style.height;
    const originalHtmlPosition = document.documentElement.style.position;

    document.body.style.overflow = 'hidden';
    document.body.style.height = '100dvh';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';

    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.height = '100dvh';
    document.documentElement.style.position = 'fixed';

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.height = originalBodyHeight;
      document.body.style.position = originalBodyPosition;
      document.body.style.width = originalBodyWidth;

      document.documentElement.style.overflow = originalHtmlOverflow;
      document.documentElement.style.height = originalHtmlHeight;
      document.documentElement.style.position = originalHtmlPosition;
    };
  }, []);

  useEffect(() => {
    // Токен нужен для игр с авторизацией (сервер берёт имя из профиля).
    const socket = createSocket(localStorage.getItem('token'));
    socketRef.current = socket;

    socket.on('joined', (d: { playerId: string }) => {
      playerIdRef.current = d.playerId;
      if (code) localStorage.setItem(pidKey(code), d.playerId);
      joinedRef.current = true;
      setJoined(true);
      setError('');
    });
    socket.on('error-msg', ({ message }: { message: string }) => {
      joinedRef.current = false;
      setJoined(false);
      setError(message);
    });
    socket.on('state', (st: MusicState) => setState(st));
    socket.on('connect', () => {
      const currentCode = joinedCodeRef.current || codeFromUrl;
      if (!currentCode) return;
      // С авторизацией имя берётся из профиля на сервере — локальное не требуется.
      const authRequired = authMode === 'required';
      const currentName = (joinedNameRef.current || localStorage.getItem('qgs_name') || '').trim();
      if (!authRequired && !currentName) return;
      if (authRequired && !localStorage.getItem('token')) return;
      if (!autoJoinTriedRef.current || joinedRef.current) {
        autoJoinTriedRef.current = true;
        emitJoin(currentCode, currentName);
      }
    });

    return () => { socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMode]);

  useEffect(() => {
    const markOffline = () => {
      socketRef.current?.emit('player:offline');
    };

    window.addEventListener('offline', markOffline);
    window.addEventListener('pagehide', markOffline);

    return () => {
      window.removeEventListener('offline', markOffline);
      window.removeEventListener('pagehide', markOffline);
    };
  }, []);

  const join = () => {
    const trimmed = name.trim();
    if (!trimmed || !code) return;
    keepAwake();
    localStorage.setItem('qgs_name', trimmed);
    autoJoinTriedRef.current = true;
    emitJoin(code, trimmed);
  };

  const me = state?.players.find((p) => p.id === playerIdRef.current);
  const isTeam = state?.mode === 'team';
  // Ключ группы для определения «мой ли это баззер» (команда в team, иначе сам игрок).
  const myGroupId = isTeam ? (me?.teamId || null) : playerIdRef.current;
  const [scoreFlash, setScoreFlash] = useState(false);
  const prevScoreRef = useRef<number | null>(null);
  const scoreFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!joined || !me) {
      prevScoreRef.current = null;
      setScoreFlash(false);
      return;
    }

    const prevScore = prevScoreRef.current;
    prevScoreRef.current = me.score;
    if (prevScore === null || me.score <= prevScore) return;

    setScoreFlash(true);
    if (scoreFlashTimerRef.current) clearTimeout(scoreFlashTimerRef.current);
    scoreFlashTimerRef.current = setTimeout(() => {
      setScoreFlash(false);
      scoreFlashTimerRef.current = null;
    }, 900);
  }, [joined, me]);

  useEffect(() => () => {
    if (scoreFlashTimerRef.current) clearTimeout(scoreFlashTimerRef.current);
  }, []);

  useEffect(() => {
    if (!joined || !state) return;

    const prev = prevStateRef.current;
    const playerId = playerIdRef.current;
    prevStateRef.current = state;
    if (!prev || !playerId) return;

    // Группа игрока: в team-режиме баззер привязан к команде, иначе к игроку.
    const myGid =
      state.mode === 'team'
        ? state.players.find((p) => p.id === playerId)?.teamId || null
        : playerId;

    const isNewPlayingRound =
      state.phase === 'playing' &&
      (prev.phase !== 'playing' || prev.currentIndex !== state.currentIndex);
    if (isNewPlayingRound) {
      vibrate([180, 80, 180]);
      return;
    }

    const isNewBuzz = state.phase === 'buzzed' && prev.phase !== 'buzzed';
    if (isNewBuzz) {
      vibrate(state.buzzed?.id === myGid ? [220, 90, 320] : 180);
      return;
    }

    const isCorrectReveal = state.phase === 'reveal' && prev.phase === 'buzzed';
    if (isCorrectReveal) {
      vibrate(prev.buzzed?.id === myGid ? [180, 80, 180, 80, 420] : [160, 80, 160]);
      return;
    }

    const isWrongAnswer = state.phase === 'playing' && prev.phase === 'buzzed';
    if (isWrongAnswer && prev.buzzed?.id === myGid) {
      vibrate([420, 120, 420]);
    }
  }, [joined, state]);

  // ---------- загрузка меты ----------
  if (!joined && authMode === null) {
    return (
      <div className="h-[calc(100dvh-4rem)] flex items-center justify-center text-zinc-400">
        Загрузка…
      </div>
    );
  }

  // ---------- игра с авторизацией: нужен вход в аккаунт ----------
  if (!joined && needsLogin) {
    const redirect = encodeURIComponent(`/m/play?code=${code}`);
    return (
      <div className="h-[calc(100dvh-4rem)] overflow-hidden flex items-center justify-center px-4 py-6">
        <div className="glass w-full max-w-sm p-6 text-center">
          <h1 className="font-display text-2xl font-bold mb-3">🔒 Нужен вход</h1>
          <p className="text-zinc-400 mb-6">Эта игра — для зарегистрированных игроков. Войдите в аккаунт, чтобы участвовать.</p>
          <Link to={`/login?redirect=${redirect}`} className="btn-grad inline-block w-full rounded-lg py-3 font-bold text-lg">
            Войти в аккаунт
          </Link>
        </div>
      </div>
    );
  }

  // ---------- игра с авторизацией: подключаемся по аккаунту ----------
  if (!joined && authMode === 'required') {
    return (
      <div className="h-[calc(100dvh-4rem)] flex flex-col items-center justify-center px-4 text-center">
        {error ? (
          <div className="glass max-w-sm p-6">
            <p className="text-rose-300">{error}</p>
          </div>
        ) : (
          <p className="text-zinc-400">Подключаемся как @{storedUser?.nickname || 'игрок'}…</p>
        )}
      </div>
    );
  }

  // ---------- вход по имени (open) ----------
  if (!joined) {
    return (
      <div className="h-[calc(100dvh-4rem)] overflow-hidden flex items-center justify-center px-4 py-6">
        <div className="glass w-full max-w-sm p-6">
          <h1 className="font-display text-2xl font-bold text-center mb-6">🎵 Вход в игру</h1>
          {error && (
            <div className="mb-4 rounded border border-rose-500/20 bg-rose-500/10 p-3 text-rose-300 text-sm">
              {error}
            </div>
          )}
          {!codeFromUrl && (
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Код игры"
              maxLength={6}
              className="input-dark mb-3 text-center text-lg tracking-widest"
            />
          )}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && join()}
            placeholder="Твоё имя или ник"
            maxLength={24}
            className="input-dark mb-4"
          />
          <button onClick={join} className="btn-grad w-full rounded-lg py-3 font-bold text-lg">
            Войти в игру
          </button>
        </div>
      </div>
    );
  }

  // ---------- игровые экраны ----------
  const phase = state?.phase;

  const inRoundPhase = phase === 'playing' || phase === 'buzzed' || phase === 'ended' || phase === 'reveal';

  return (
    <div className="h-[calc(100dvh-4rem)] overflow-hidden flex flex-col px-4 py-4 text-center">
      {/* HUD: имя и счёт прижаты к верху — баззеру внизу просторно */}
      {me && (
        <div className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-2.5">
          <div className="min-w-0 text-left">
            <p className="truncate font-bold text-zinc-100">
              {isTeam && me.teamName ? <>👥 {me.teamName}</> : me.name}
            </p>
            {isTeam && me.teamName && (
              <p className="truncate text-xs text-zinc-500">{me.name}</p>
            )}
          </div>
          <span
            key={me.score}
            className={`qgs-pop shrink-0 rounded-full border px-3.5 py-1 font-mono text-lg font-bold transition-colors duration-500 ${
              scoreFlash
                ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.4)]'
                : 'border-violet-400/20 bg-violet-500/15 text-violet-300'
            }`}
          >
            {me.score}
          </span>
        </div>
      )}
      {/* Контекст раунда — в том же формате, что шапка проектора:
          служебная строка → название блока (бегущая строка, если не влезает) → точки */}
      {state && inRoundPhase && state.blockName && (
        <div className="mt-2.5 flex w-full flex-col items-center gap-1.5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            {state.gameName} · песня {Math.min(state.currentIndex + 1, state.total)} из {state.total}
          </p>
          <MarqueeText
            text={state.blockName}
            className="w-full font-display text-base font-extrabold leading-tight text-white"
          />
          {(state.blockTotal || 0) > 0 && (
            (state.blockTotal || 0) <= 16 ? (
              <div className="flex items-center gap-1.5">
                {Array.from({ length: state.blockTotal || 0 }).map((_, i) => {
                  const cur = state.blockCurrentIndex ?? 0;
                  const role = i === cur ? 'cur' : i < cur ? 'done' : 'todo';
                  return (
                    <span
                      key={`${i}-${role}`}
                      className={`rounded-full ${
                        role === 'cur'
                          ? 'qgs-pop h-2 w-2 bg-fuchsia-400 shadow-[0_0_8px_rgba(217,70,239,0.8)]'
                          : role === 'done'
                            ? 'h-1.5 w-1.5 bg-violet-400/60'
                            : 'h-1.5 w-1.5 bg-white/15'
                      }`}
                    />
                  );
                })}
              </div>
            ) : (
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                в блоке {(state.blockCurrentIndex ?? 0) + 1} из {state.blockTotal}
              </p>
            )
          )}
        </div>
      )}

      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center">

      {phase === 'lobby' && (
        <div className="glass w-full max-w-sm p-8">
          <p className="text-xl mb-6">Привет, {me?.name || name}!</p>
          <button
            onClick={() => {
              vibrate(180);
              keepAwake();
              socketRef.current?.emit('player:ready', { ready: !(me && me.ready) });
            }}
            className={`w-full rounded-2xl py-6 text-xl font-black tracking-wide uppercase transition-all duration-500 transform active:scale-95 ${
              me?.ready
                ? 'bg-emerald-600 border border-emerald-400/30 text-white shadow-xl shadow-emerald-500/30 scale-[1.02]'
                : 'bg-violet-600 border border-violet-400/40 text-white shadow-lg shadow-violet-500/20 hover:bg-violet-500 hover:scale-[1.02]'
            }`}
          >
            {me?.ready ? '✓ Готов к игре' : 'Я готов! ⚡'}
          </button>
          <p className="mt-4 text-sm text-zinc-500">
            Игроков: {state?.players.length}. Ждём ведущего…
          </p>
        </div>
      )}

      {phase === 'finished' && (
        <div className="glass w-full max-w-sm p-6 flex flex-col max-h-[80vh] overflow-hidden">
          <div className="font-display text-3xl font-extrabold mb-2 bg-gradient-to-r from-amber-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
            🏆 Игра окончена!
          </div>
          {me && (
            <p className="text-md text-zinc-300 mb-4 pb-3 border-b border-white/5">
              Твой счёт: <span className="font-bold text-violet-300">{me.score}</span>
            </p>
          )}
          
          <div className="text-left font-semibold text-xs text-zinc-500 uppercase tracking-widest mb-3">
            Таблица результатов:
          </div>
          
          <div className="flex-1 overflow-y-auto pr-1 space-y-2">
            {[...(isTeam
              ? (state?.teams || []).map((t) => ({ id: t.id, name: `👥 ${t.name}`, score: t.score }))
              : (state?.players || []).map((p) => ({ id: p.id, name: p.name, score: p.score })))]
              .sort((a, b) => b.score - a.score)
              .map((p, i) => {
                const isMe = p.id === myGroupId;
                let badge = '';
                let rowClass = 'bg-white/[0.02] border border-white/5';
                let textClass = 'text-zinc-300';
                let scoreClass = 'text-violet-400/80';
                
                if (i === 0) {
                  badge = '🥇';
                  rowClass = 'bg-amber-500/10 border border-amber-500/20';
                  textClass = 'text-amber-200 font-bold';
                  scoreClass = 'text-amber-300 font-extrabold';
                } else if (i === 1) {
                  badge = '🥈';
                  rowClass = 'bg-zinc-400/10 border border-zinc-400/20';
                  textClass = 'text-zinc-200 font-semibold';
                  scoreClass = 'text-zinc-300 font-bold';
                } else if (i === 2) {
                  badge = '🥉';
                  rowClass = 'bg-amber-700/10 border border-amber-700/20';
                  textClass = 'text-amber-600/90 font-medium';
                  scoreClass = 'text-amber-500 font-bold';
                }
                
                if (isMe) {
                  rowClass += ' ring-2 ring-violet-500/50 bg-violet-500/10';
                }
                
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between rounded-xl px-4 py-3 transition-all duration-300 ${rowClass}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 text-left">
                      <span className="w-5 text-center text-sm font-bold text-zinc-500">
                        {badge || `#${i + 1}`}
                      </span>
                      <span className={`truncate text-sm ${textClass}`}>
                        {p.name} {isMe && <span className="ml-1 text-[10px] uppercase font-bold text-violet-300 bg-violet-500/20 px-1.5 py-0.5 rounded">Вы</span>}
                      </span>
                    </div>
                    <span className={`font-mono text-sm whitespace-nowrap ml-2 ${scoreClass}`}>{p.score}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {(phase === 'intro' || phase === 'blockIntro') && (
        <div className="glass w-full max-w-sm p-8">
          <div className="font-display text-2xl font-bold text-violet-300 mb-2">
            {phase === 'intro' ? '🎵 Игра начинается!' : '🎵 Новый блок!'}
          </div>
          {state?.blockName && (
            <p className="text-xl font-bold text-white mb-2">{state.blockName}</p>
          )}
          <p className="text-zinc-400">Приготовься — скоро зазвучит музыка…</p>
        </div>
      )}

      {/* Круг стабильно на месте во всех фазах раунда — статусы внутри него */}
      {phase === 'reveal' && (
        <>
          <Buzzer label="Угадано!" btnClass="qgs-mobile-buzzer--success scale-[1.02]" />
          {state?.reveal && (
            <div
              className="pointer-events-none fixed inset-x-4 z-40 mx-auto max-w-sm"
              style={{ bottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
            >
              <div className="qgs-answer-toast flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-[#071512]/95 p-3 text-left shadow-2xl shadow-emerald-950/40 backdrop-blur-md">
                {state.reveal.cover && (
                  <img
                    src={musicCoverSrc(state.reveal.cover)}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400/80">
                    Правильный ответ
                  </p>
                  <p className="truncate text-sm font-bold text-emerald-200">
                    {state.reveal.title} — {state.reveal.artist}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {phase === 'ended' && (
        <>
          <Buzzer label="Фрагмент закончился" btnClass="qgs-mobile-buzzer--idle scale-95" />
          <div
            className="pointer-events-none fixed inset-x-4 z-40 mx-auto max-w-sm"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
          >
            <div className="qgs-answer-toast rounded-xl border border-amber-500/20 bg-[#171107]/95 p-3 text-left shadow-2xl shadow-amber-950/30 backdrop-blur-md">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/80">
                Фрагмент закончился
              </p>
              <p className="text-sm font-bold text-amber-100">
                Ждём решения ведущего…
              </p>
            </div>
          </div>
        </>
      )}

      {phase === 'buzzed' && (
        <Buzzer
          label={
            state?.buzzed?.id === myGroupId
              ? isTeam
                ? `Отвечает твоя команда${state?.buzzed?.by ? ` · ${state.buzzed.by}` : ''}`
                : 'Ты первый!'
              : `Отвечает ${state?.buzzed?.name || '…'}${isTeam && state?.buzzed?.by ? ` · ${state.buzzed.by}` : ''}`
          }
          btnClass={
            state?.buzzed?.id === myGroupId
              ? 'qgs-mobile-buzzer--success scale-[1.02]'
              : 'qgs-mobile-buzzer--waiting scale-95'
          }
        />
      )}

      {phase === 'playing' && (
        <>
          <Buzzer
            label={me?.armed ? 'ЖМИ!' : state?.paused ? '⏸ Пауза' : me?.locked ? 'Мимо' : 'Приготовься…'}
            onBuzz={me?.armed ? () => {
              vibrate(220);
              keepAwake();
              socketRef.current?.emit('player:buzz');
            } : undefined}
            btnClass={
              me?.armed
                ? 'qgs-mobile-buzzer--armed scale-[1.02] cursor-pointer'
                : state?.paused
                  ? 'qgs-mobile-buzzer--paused scale-95'
                  : me?.locked
                    ? 'qgs-mobile-buzzer--locked scale-95'
                    : 'qgs-mobile-buzzer--idle scale-95'
            }
          />
          {me?.locked && (
            <div
              className="pointer-events-none fixed inset-x-4 z-40 mx-auto max-w-sm"
              style={{ bottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
            >
              <div className="qgs-answer-toast rounded-xl border border-rose-500/20 bg-[#18070c]/95 p-3 text-left shadow-2xl shadow-rose-950/35 backdrop-blur-md">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-300/80">
                  Мимо
                </p>
                <p className="text-sm font-bold text-rose-100">
                  {isTeam
                    ? 'Команда уже ответила на этой песне — ждём других.'
                    : 'Ты уже ответил на этой песне — ждём других.'}
                </p>
              </div>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}

// Большая кнопка-баззер. onPointerDown — раньше click, меньше задержка.
function Buzzer({
  label,
  onBuzz,
  btnClass,
}: {
  label: string;
  onBuzz?: () => void;
  btnClass: string;
}) {
  const disabled = !onBuzz;
  return (
    <button
      onPointerDown={(e) => {
        if (disabled || !onBuzz) return;
        e.preventDefault();
        onBuzz();
      }}
      disabled={disabled}
      className={`qgs-mobile-buzzer select-none touch-none flex h-64 w-64 items-center justify-center rounded-full text-3xl font-black text-center p-4 transition-all duration-500 transform active:scale-95 ${btnClass}`}
    >
      <span className="relative z-10">{label}</span>
    </button>
  );
}

// Однострочный текст: влезает — по центру, не влезает — бегущая строка.
function MarqueeText({ text, className }: { text: string; className?: string }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scroll, setScroll] = useState(false);
  // Смена текста → сначала обычный режим, там же перемеряем переполнение.
  useEffect(() => { setScroll(false); }, [text]);
  useEffect(() => {
    if (scroll) return;
    const el = wrapRef.current;
    if (el && el.scrollWidth > el.clientWidth + 4) setScroll(true);
  });
  if (!scroll) {
    return (
      <div ref={wrapRef} className={`truncate ${className || ''}`}>
        {text}
      </div>
    );
  }
  return (
    <div className={`overflow-hidden ${className || ''}`}>
      {/* текст дублируется — сдвиг на 50% даёт бесшовный цикл */}
      <div className="qgs-marquee inline-flex whitespace-nowrap will-change-transform">
        <span className="pr-12">{text}</span>
        <span className="pr-12" aria-hidden>{text}</span>
      </div>
    </div>
  );
}
