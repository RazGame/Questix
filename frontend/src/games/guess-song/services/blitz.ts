import { Song } from '../../../core/types';

/**
 * Варианты ответа для блиц-раунда: правильный плюс три чужих.
 *
 * Неверные берём из соседей по блоку — они той же эпохи и жанра, поэтому
 * отсеять их «на глаз», не узнав песню, заметно труднее, чем случайные.
 */

const label = (s: Song) => `${s.title} — ${s.artist}`.trim() || s.title || 'Без названия';

/**
 * Перемешивание Фишера—Йетса.
 *
 * Раньше стояло `sort(() => 0.5 - Math.random())`. Так делать нельзя:
 * компаратор непоследователен, и распределение получается перекошенным —
 * правильный ответ чаще оказывается на одних и тех же местах, а игроки
 * такие вещи считывают на третьем раунде.
 */
export const shuffle = <T>(items: T[]): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Четыре варианта для песни: правильный + три из того же блока. */
export const buildBlitzOptions = (song: Song, blockSongs: Song[]): string[] => {
  const correct = label(song);
  const others = shuffle(
    blockSongs
      .filter((s) => s._id !== song._id)
      .map(label)
      .filter((t) => t && t !== correct)
  );

  const options = [correct, ...others.slice(0, 3)];
  // Песен в блоке меньше четырёх — дополняем заглушками, чтобы ведущий сразу
  // увидел, что варианты надо дописать руками.
  while (options.length < 4) options.push(`Вариант ${options.length + 1}`);
  return shuffle(options);
};
