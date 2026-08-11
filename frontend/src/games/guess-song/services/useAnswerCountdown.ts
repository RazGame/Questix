import { useEffect, useRef, useState } from 'react';
import { MusicState } from '../../../core/types';

/**
 * Обратный отсчёт времени на ответ.
 *
 * Считаем от остатка, который прислал сервер, и вычитаем время, прошедшее по
 * собственным часам устройства. Заманчиво было брать присланный момент
 * истечения и сравнивать с Date.now(), но часы сервера и устройства
 * расходятся: на проверке контейнер убежал на несколько секунд, и счётчик
 * первые секунды честно показывал «11» из десяти. Так же он не зависит от
 * частоты рассылок — идёт ровно между обновлениями состояния.
 *
 * На паузе ведущего сервер не присылает момента истечения: счётчик замирает
 * на остатке и ждёт продолжения.
 */
export function useAnswerCountdown(state: MusicState | null) {
  const total = state?.answerTotalMs || 0;
  const running = !!state?.answerEndsAt; // null на паузе
  const sent = state?.answerLeftMs ?? null;
  const active = state?.phase === 'buzzed' && total > 0 && sent != null;

  const [leftMs, setLeftMs] = useState(sent ?? total);
  const baseRef = useRef<{ left: number; at: number }>({ left: total, at: 0 });
  const rafRef = useRef<number | null>(null);

  // Новая опорная точка — только когда сервер прислал другой остаток.
  useEffect(() => {
    if (sent == null) return;
    baseRef.current = { left: sent, at: performance.now() };
    setLeftMs(sent);
  }, [sent, running]);

  useEffect(() => {
    if (!active) return;
    if (!running) {
      setLeftMs(Math.max(0, sent ?? 0)); // пауза: стоим на месте
      return;
    }
    const tick = () => {
      const { left, at } = baseRef.current;
      setLeftMs(Math.max(0, left - (performance.now() - at)));
      rafRef.current = window.requestAnimationFrame(tick);
    };
    tick();
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [active, running, sent]);

  return {
    active,
    leftMs,
    totalMs: total,
    seconds: Math.max(0, Math.ceil(leftMs / 1000)),
    /** Доля оставшегося времени, 1 → 0. Для кольца прогресса. */
    fraction: total > 0 ? Math.max(0, Math.min(1, leftMs / total)) : 0,
    /** Последние секунды — повод для красного и подрагивания. */
    urgent: total > 0 && leftMs <= Math.min(5000, total * 0.34),
  };
}
