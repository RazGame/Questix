import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { gameModules } from '../../games/registry';

// Единый вход по коду игры: спрашиваем бэкенд GET /join/:code, по kind
// находим модуль в реестре и уводим игрока на его страницу входа.
export default function JoinByCode() {
  const navigate = useNavigate();
  const { code: codeFromUrl } = useParams<{ code?: string }>();
  const [code, setCode] = useState((codeFromUrl || '').toUpperCase());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const join = async (target: string) => {
    const clean = target.trim().toUpperCase();
    if (!clean) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.get(`/join/${clean}`);
      const kind = res.data?.kind;
      const module = gameModules.find((m) => m.kind === kind && m.playerPath);
      if (module?.playerPath) {
        navigate(module.playerPath(clean));
      } else {
        setError('К этой игре нельзя подключиться по коду.');
      }
    } catch (e: any) {
      setError(e.response?.data?.error || 'Игра не найдена');
    } finally {
      setBusy(false);
    }
  };

  // Код пришёл в URL (/join/ABCD) — пробуем сразу.
  useEffect(() => {
    if (codeFromUrl) join(codeFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeFromUrl]);

  return (
    <div className="h-[calc(100dvh-4rem)] flex items-center justify-center px-4">
      <div className="glass w-full max-w-sm p-6">
        <h1 className="font-display text-2xl font-bold text-center mb-6">🎮 Вход по коду</h1>
        {error && (
          <div className="mb-4 rounded border border-rose-500/20 bg-rose-500/10 p-3 text-rose-300 text-sm">
            {error}
          </div>
        )}
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && join(code)}
          placeholder="Код игры"
          maxLength={6}
          className="input-dark mb-4 text-center text-lg tracking-widest"
        />
        <button
          onClick={() => join(code)}
          disabled={busy || !code.trim()}
          className="btn-grad w-full rounded-lg py-3 font-bold text-lg disabled:opacity-50"
        >
          {busy ? 'Ищем игру…' : 'Войти'}
        </button>
      </div>
    </div>
  );
}
