import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createSocket } from '../services/socket';
import { MusicState } from '../types';

// Телефон игрока «Угадай мелодию». Без регистрации на платформе: вход по коду/QR.
// Баззер на onPointerDown ради минимальной задержки.
export default function MusicPlay() {
  const [params] = useSearchParams();
  const codeFromUrl = (params.get('code') || '').toUpperCase();

  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const playerIdRef = useRef<string | null>(null);

  const [code, setCode] = useState(codeFromUrl);
  const [name, setName] = useState(localStorage.getItem('qgs_name') || '');
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');
  const [state, setState] = useState<MusicState | null>(null);

  const pidKey = (c: string) => `qgs_pid_${c}`;

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    socket.on('joined', (d: { playerId: string }) => {
      playerIdRef.current = d.playerId;
      if (code) localStorage.setItem(pidKey(code), d.playerId);
      setJoined(true);
      setError('');
    });
    socket.on('error-msg', ({ message }: { message: string }) => {
      setJoined(false);
      setError(message);
    });
    socket.on('state', (st: MusicState) => setState(st));

    return () => { socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const join = () => {
    const trimmed = name.trim();
    if (!trimmed || !code) return;
    localStorage.setItem('qgs_name', trimmed);
    const savedPid = localStorage.getItem(pidKey(code));
    playerIdRef.current = savedPid;
    socketRef.current?.emit('join', { role: 'player', code, name: trimmed, playerId: savedPid });
  };

  const me = state?.players.find((p) => p.id === playerIdRef.current);

  // ---------- экран входа ----------
  if (!joined) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
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

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-8 text-center">
      {me && (
        <div className="mb-6 text-zinc-300">
          {me.name} · <span className="font-bold text-violet-300">{me.score}</span>
        </div>
      )}

      {phase === 'lobby' && (
        <div className="glass w-full max-w-sm p-8">
          <p className="text-xl mb-6">Привет, {me?.name || name}!</p>
          <button
            onClick={() => socketRef.current?.emit('player:ready', { ready: !(me && me.ready) })}
            className={`w-full rounded-xl py-5 text-xl font-bold transition ${
              me?.ready ? 'btn-grad' : 'bg-white/5 border border-white/10 text-zinc-200 hover:bg-white/10'
            }`}
          >
            {me?.ready ? '✓ Готов' : 'Нажми «Готов»'}
          </button>
          <p className="mt-4 text-sm text-zinc-500">
            Игроков: {state?.players.length}. Ждём ведущего…
          </p>
        </div>
      )}

      {phase === 'finished' && (
        <div className="glass w-full max-w-sm p-8">
          <div className="font-display text-3xl font-bold mb-3">🏆 Игра окончена!</div>
          {me && <p className="text-lg text-zinc-300">Твой счёт: <span className="font-bold text-violet-300">{me.score}</span></p>}
        </div>
      )}

      {phase === 'reveal' && (
        <div className="glass w-full max-w-sm p-8">
          <div className="font-display text-2xl font-bold text-emerald-300 mb-2">✓ Правильно!</div>
          <p className="text-zinc-300">{state?.reveal?.title} — {state?.reveal?.artist}</p>
        </div>
      )}

      {phase === 'buzzed' && (
        <Buzzer
          label={state?.buzzed?.id === playerIdRef.current ? '🔔 Ты нажал первым!' : `Отвечает ${state?.buzzed?.name || '…'}`}
          disabled
        />
      )}

      {phase === 'playing' && (
        <Buzzer
          label={me?.armed ? 'ЖМИ!' : me?.locked ? 'мимо' : 'Приготовься…'}
          disabled={!me?.armed}
          onBuzz={() => socketRef.current?.emit('player:buzz')}
          locked={me?.locked}
        />
      )}
    </div>
  );
}

// Большая кнопка-баззер. onPointerDown — раньше click, меньше задержка.
function Buzzer({
  label,
  disabled,
  onBuzz,
  locked,
}: {
  label: string;
  disabled?: boolean;
  onBuzz?: () => void;
  locked?: boolean;
}) {
  return (
    <>
      <button
        onPointerDown={(e) => {
          if (disabled || !onBuzz) return;
          e.preventDefault();
          onBuzz();
        }}
        disabled={disabled}
        className={`select-none touch-none flex h-64 w-64 items-center justify-center rounded-full text-3xl font-black transition ${
          disabled
            ? 'bg-white/5 text-zinc-500 border border-white/10'
            : 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-glow active:scale-95'
        }`}
      >
        {label}
      </button>
      {locked && <p className="mt-4 text-sm text-zinc-500">Ты уже ответил на этой песне — ждём других.</p>}
    </>
  );
}
