/**
 * Сопоставление результата поиска с тем, что мы искали.
 *
 * Отдельно сравниваем исполнителя и название — так ловятся два типа подделок,
 * которые пропускало сравнение по одной строке:
 *   «Григорий Швэпс — Рюмка водки на столе» (пародия под Лепса: название точное,
 *   исполнитель почти совпадает по буквам, но не по словам);
 *   «OLISHA — Артик и Асти» (в названии стоит имя чужой группы).
 * При этом честные транслитерации должны проходить: каталог отдаёт
 * «Vremya i Steklo», «Leningrad», «Gosti iz Budushchego».
 */

const RU2LAT = {
  а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'y',
  к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f',
  х:'kh', ц:'ts', ч:'ch', ш:'sh', щ:'shch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya',
};

const norm = (s) =>
  String(s || '').toLowerCase().replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9 ]/gi, ' ').replace(/\s+/g, ' ').trim();

const translit = (s) => norm(s).split('').map((c) => (c in RU2LAT ? RU2LAT[c] : c)).join('');

const isCyr = (s) => /[а-яё]/i.test(s);

/** Доля слов ожидаемого, найденных в полученном. */
function wordOverlap(want, got) {
  const w = norm(want).split(' ').filter(Boolean);
  const g = new Set(norm(got).split(' ').filter(Boolean));
  if (!w.length) return 0;
  return w.filter((x) => g.has(x)).length / w.length;
}

/** Похожесть строк 0..1 (расстояние Левенштейна). */
function ratio(a, b) {
  a = norm(a).replace(/ /g, ''); b = norm(b).replace(/ /g, '');
  if (!a.length || !b.length) return 0;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length);
}

/**
 * Исполнитель: в одном алфавите сравниваем ПО СЛОВАМ (иначе «Швэпс» сойдёт
 * за «Лепс»), в разных — по транслитерации, там побуквенно допустимо
 * («Кар-Мэн» → «Car-Man»).
 */
function artistScore(want, got) {
  if (isCyr(want) === isCyr(got)) {
    // Только в сторону «все ли слова ожидаемого нашлись»: обратное сравнение
    // прощало подмену фамилии (Лепс → Швэпс), а лишние соисполнители
    // в найденном («Eiffel 65, Gabry Ponte») при этом не мешают.
    return wordOverlap(want, got);
  }
  const t = translit(want);
  return Math.max(ratio(t, got), wordOverlap(t, norm(got)), wordOverlap(norm(got), t));
}

// Версии, которые для угадайки почти всегда не те
const BAD = /\b(live|karaoke|караоке|instrumental|инструментал|tribute|sped up|slowed|nightcore|remix|ремикс|cover|кавер|acoustic|reprise|demo|workout|made popular|in the style|минус|backing track)\b/i;

/**
 * Оценка кандидата. Название — главный якорь (оно обычно остаётся на языке
 * оригинала), исполнитель — подтверждение.
 */
function scoreCandidate(want, r) {
  const t = Math.max(wordOverlap(want.t, r.title), ratio(want.t, r.title));
  const a = artistScore(want.a, r.artist);
  let s = 0.6 * t + 0.4 * a;

  // Лишние слова в названии («Нюша - Выше (ремикс)») — это не наш трек
  if (BAD.test(r.title) && !BAD.test(want.t)) s -= 0.5;
  if (r.duration && (r.duration < 90 || r.duration > 480)) s -= 0.3;
  // Точное совпадение названия ценнее длинного варианта с приписками
  if (norm(r.title) === norm(want.t)) s += 0.08;

  return { s, t, a };
}

/** Лучший кандидат + причина отказа, если не подошёл. */
function pick(want, results) {
  const scored = results
    .map((r) => ({ r, ...scoreCandidate(want, r) }))
    .sort((x, y) => y.s - x.s);
  const best = scored[0];
  if (!best) return { ok: false, why: 'пусто' };
  if (best.t < 0.55) return { ok: false, why: `название не то: ${best.r.artist} — ${best.r.title}`, best };
  if (best.a < 0.6) return { ok: false, why: `исполнитель не тот: ${best.r.artist} — ${best.r.title}`, best };
  return { ok: true, ...best };
}

module.exports = { pick, scoreCandidate, artistScore, wordOverlap, ratio, translit, norm };
