import React from 'react';
import { ProgressRing } from './ProgressRing';

/**
 * Обратный отсчёт в центре проектора — на месте знака вопроса.
 *
 * Отдельного кольца прогресса тут нет намеренно: истекает та самая рамка
 * круга, которая и так горит при нажатии. Второе кольцо рядом с первым
 * читалось как рассогласованная деталь, а одно — как единый таймер.
 *
 * Дуга рисуется конической заливкой с кольцевой маской: толщина совпадает с
 * рамкой, а радиус задан в долях контейнера, поэтому масштабирование экрана
 * ей не мешает.
 *
 * Цифра меняется по ключу, поэтому React пересоздаёт элемент и анимация
 * запускается заново — секунды щёлкают, а не мигают.
 */
export const AnswerCountdown: React.FC<{
  seconds: number;
  fraction: number; // 1 → 0
  urgent: boolean;
}> = ({ seconds, fraction, urgent }) => {
  const color = urgent ? '#fb7185' : '#fcd34d';

  return (
    <div className="qgs-count-enter relative flex h-full w-full items-center justify-center">
      <ProgressRing
        fraction={fraction}
        color={color}
        glow={urgent ? 'rgba(251,113,133,0.55)' : 'rgba(252,211,77,0.45)'}
      />
      <div className={`relative z-10 flex flex-col items-center ${urgent ? 'qgs-count-urgent' : ''}`}>
        <span
          key={seconds}
          className={`qgs-count-pop font-display text-8xl font-black leading-none ${
            urgent ? 'text-rose-300' : 'text-white'
          }`}
        >
          {seconds}
        </span>
        <span className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.28em] text-white/45">
          на ответ
        </span>
      </div>
    </div>
  );
};
