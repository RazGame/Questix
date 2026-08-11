import React from 'react';

export interface StandingRow {
  id: string;
  name: string;
  score: number;
}

/**
 * Таблица результатов на проекторе — и промежуточная, и финальная.
 *
 * Главное здесь — колонки. Одним столбцом два десятка участников дают
 * полотно втрое выше экрана; FitScreen честно ужимает его целиком, и имена
 * становятся мельче семи пикселей — с задних рядов не прочитать вообще.
 * Поэтому при большом составе список раскладывается в две-три колонки и
 * строки становятся плотнее: лучше меньше воздуха, чем нечитаемый кегль.
 *
 * Порядок — по колонкам сверху вниз: первое место в левом верхнем углу,
 * как в любой турнирной таблице.
 */

const medals = ['🥇', '🥈', '🥉'];

const columnsFor = (n: number) => (n <= 10 ? 1 : n <= 24 ? 2 : 3);

const chunk = <T,>(items: T[], parts: number): T[][] => {
  const per = Math.ceil(items.length / parts);
  return Array.from({ length: parts }, (_, i) => items.slice(i * per, (i + 1) * per))
    .filter((c) => c.length);
};

export const Leaderboard: React.FC<{ rows: StandingRow[]; dense?: boolean }> = ({ rows, dense }) => {
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  const cols = columnsFor(sorted.length);
  // Плотный режим включается сам, как только колонок больше одной: иначе
  // выигрыш от колонок съедается высотой строк.
  const tight = dense || cols > 1;

  const gridCls = cols === 3 ? 'md:grid-cols-3' : cols === 2 ? 'md:grid-cols-2' : 'grid-cols-1';
  const widthCls = cols === 3 ? 'max-w-[92rem]' : cols === 2 ? 'max-w-6xl' : 'max-w-3xl';

  return (
    <div className={`grid w-full ${widthCls} grid-cols-1 gap-x-6 ${gridCls} ${tight ? 'gap-y-2' : 'gap-y-3'}`}>
      {chunk(sorted, cols).map((column, ci) => (
        <div key={ci} className={tight ? 'space-y-2' : 'space-y-3'}>
          {column.map((row) => {
            const place = sorted.indexOf(row);
            const medal = medals[place];
            const top =
              place === 0
                ? 'border-amber-300/40 bg-amber-400/10 shadow-lg shadow-amber-950/20'
                : place === 1
                  ? 'border-zinc-300/30 bg-zinc-400/10'
                  : place === 2
                    ? 'border-amber-700/40 bg-amber-700/10'
                    : 'border-white/5 bg-white/[0.03]';
            return (
              <div
                key={row.id}
                className={`flex items-center gap-3 rounded-xl border ${top} ${
                  tight ? 'px-4 py-2' : 'px-5 py-3'
                }`}
              >
                <span className={`shrink-0 text-center ${tight ? 'w-8 text-xl' : 'w-10 text-2xl'}`}>
                  {medal || ''}
                </span>
                <span className={`shrink-0 font-mono font-bold text-zinc-500 ${tight ? 'w-7 text-base' : 'w-8 text-lg'}`}>
                  {place + 1}
                </span>
                <span
                  className={`font-display min-w-0 flex-1 truncate text-left font-bold ${
                    tight ? 'text-xl' : 'text-2xl'
                  } ${place === 0 ? 'text-amber-200' : 'text-zinc-100'}`}
                  title={row.name}
                >
                  {row.name}
                </span>
                <span
                  className={`font-display shrink-0 font-black ${tight ? 'text-2xl' : 'text-3xl'} ${
                    place === 0 ? 'text-amber-300' : 'text-violet-300'
                  }`}
                >
                  {row.score}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};
