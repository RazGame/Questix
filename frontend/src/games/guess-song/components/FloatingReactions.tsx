import React from 'react';

export interface ReactionFlyItem {
  id: string;
  emoji: string;
  senderName?: string;
  leftPct?: number;
}

interface Props {
  reactions: ReactionFlyItem[];
}

export const FloatingReactions: React.FC<Props> = ({ reactions }) => {
  if (!reactions || reactions.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {reactions.map((item) => (
        <div
          key={item.id}
          className="animate-reaction-fly absolute bottom-12 flex flex-col items-center select-none"
          style={{
            left: `${item.leftPct ?? Math.floor(10 + Math.random() * 80)}%`,
          }}
        >
          <span className="text-5xl filter drop-shadow-lg">{item.emoji}</span>
          {item.senderName && (
            <span className="mt-1 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white border border-white/20 backdrop-blur-md">
              {item.senderName}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};
