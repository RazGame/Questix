import React from 'react';

/**
 * Кольцо, «стекающее» по краю центрального круга проектора.
 *
 * Рисуется конической заливкой с кольцевой маской, а не отдельным SVG:
 * толщина и радиус тогда совпадают с рамкой круга, и в кадре остаётся одно
 * кольцо, а не два подряд — отдельная дуга внутри читалась как ошибка вёрстки.
 *
 * Радиус задан в долях контейнера, поэтому масштабирование экрана
 * (FitScreen) кольцу не мешает.
 */
export const ProgressRing: React.FC<{
  fraction: number; // 1 → 0
  color: string;
  glow: string;
  widthPx?: number;
}> = ({ fraction, color, glow, widthPx = 6 }) => {
  const mask = `radial-gradient(farthest-side, transparent calc(100% - ${widthPx}px), #000 calc(100% - ${widthPx}px))`;
  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-full"
      style={{
        background: `conic-gradient(${color} ${Math.max(0, Math.min(1, fraction)) * 360}deg, transparent 0deg)`,
        WebkitMask: mask,
        mask,
        filter: `drop-shadow(0 0 10px ${glow})`,
        transition: 'filter 400ms ease',
      }}
    />
  );
};
