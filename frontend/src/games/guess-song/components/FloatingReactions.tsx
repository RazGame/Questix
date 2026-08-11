import React from 'react';

export interface ReactionFlyItem {
  id: string;
  emoji: string;
  senderName?: string;
  leftPct?: number;
  swayPx?: number;    // половина размаха качания
  swayMs?: number;    // период качания
  swayDelayMs?: number; // сдвиг фазы, чтобы не качались хором
  risePct?: number;   // до какой высоты долетает
  durMs?: number;     // длительность полёта
}

/**
 * Реакции гостей, всплывающие над проектором.
 *
 * Три вложенных слоя не для красоты: подъём, качание и проявление — это три
 * анимации с разной длительностью и разным сглаживанием. В одном элементе
 * они бы конфликтовали за transform, и получался бы рывок на каждом кадре
 * смены направления.
 *
 * Разброс параметров задаёт экран при получении события, чтобы траектория
 * не пересчитывалась на перерисовках.
 */
export const FloatingReactions: React.FC<{ reactions: ReactionFlyItem[] }> = ({ reactions }) => {
  if (!reactions?.length) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {reactions.map((item) => (
        <div
          key={item.id}
          className="animate-reaction-fly absolute bottom-16"
          style={
            {
              left: `${item.leftPct ?? 50}%`,
              '--sway': `${item.swayPx ?? 14}px`,
              '--sway-dur': `${item.swayMs ?? 1700}ms`,
              '--sway-delay': `-${item.swayDelayMs ?? 0}ms`,
              '--rise': `${item.risePct ?? 62}vh`,
              '--dur': `${item.durMs ?? 3400}ms`,
            } as React.CSSProperties
          }
        >
          <div className="animate-reaction-sway">
            <div className="animate-reaction-appear flex select-none flex-col items-center">
              <span className="text-6xl drop-shadow-[0_4px_16px_rgba(0,0,0,0.55)]">{item.emoji}</span>
              {item.senderName && (
                <span className="mt-1 max-w-[9rem] truncate rounded-full border border-white/15 bg-black/65 px-2 py-0.5 text-xs font-semibold text-white/90 backdrop-blur-md">
                  {item.senderName}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
