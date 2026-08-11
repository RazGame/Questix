import React from 'react';

/**
 * Кольцо, «стекающее» по краю центрального круга проектора.
 *
 * Рисуется дугой SVG, а не конической заливкой: у градиента торцы всегда
 * рубленые, дуга упиралась в фон острым срезом и цеплялась взглядом. У линии
 * же есть скруглённые концы, и кольцо выглядит нарисованным, а не вырезанным.
 *
 * Координаты в долях viewBox, поэтому кольцо садится ровно по рамке круга и
 * переживает масштабирование экрана (FitScreen) без пересчёта в пикселях.
 */
const WIDTH = 2.8; // толщина в единицах viewBox (100 = диаметр круга)
const R = 50 - WIDTH / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

export const ProgressRing: React.FC<{
  fraction: number; // 1 → 0
  color: string;
  glow: string;
}> = ({ fraction, color, glow }) => {
  const left = Math.max(0, Math.min(1, fraction));
  // Совсем короткий хвост скруглениями раздувается в каплю заметного размера,
  // поэтому у самого конца дугу просто убираем.
  if (left <= 0.004) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
    >
      <circle
        cx="50"
        cy="50"
        r={R}
        fill="none"
        stroke={color}
        strokeWidth={WIDTH}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - left)}
        style={{ filter: `drop-shadow(0 0 2px ${glow})`, transition: 'stroke 400ms ease' }}
      />
    </svg>
  );
};
