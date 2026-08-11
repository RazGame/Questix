import React from 'react';

export interface ReactionFlyItem {
  id: string;
  emoji: string;
  senderName?: string;
  leftPct?: number;
  swayPx?: number;   // размах покачивания по пути вверх
  risePct?: number;  // до какой высоты долетает
  durMs?: number;    // длительность полёта
}

/**
 * Реакции гостей, всплывающие над проектором.
 *
 * Разброс намеренный: у каждой свои размах, высота и длительность. Без него
 * десяток одинаковых эмодзи летит ровной шеренгой — выглядит механически.
 * Сами значения задаёт экран при получении события, чтобы полёт не менялся
 * на перерисовках.
 */
export const FloatingReactions: React.FC<{ reactions: ReactionFlyItem[] }> = ({ reactions }) => {
  if (!reactions?.length) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {reactions.map((item) => (
        <div
          key={item.id}
          className="animate-reaction-fly absolute bottom-16 flex flex-col items-center select-none"
          style={
            {
              left: `${item.leftPct ?? 50}%`,
              '--sway': `${item.swayPx ?? 26}px`,
              '--rise': `${item.risePct ?? 62}vh`,
              '--dur': `${item.durMs ?? 3400}ms`,
            } as React.CSSProperties
          }
        >
          <span className="text-6xl drop-shadow-[0_4px_16px_rgba(0,0,0,0.55)]">{item.emoji}</span>
          {item.senderName && (
            <span className="mt-1 max-w-[9rem] truncate rounded-full border border-white/15 bg-black/65 px-2 py-0.5 text-xs font-semibold text-white/90 backdrop-blur-md">
              {item.senderName}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};
