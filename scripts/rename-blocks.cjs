/**
 * Единообразные названия блоков и порядок по времени.
 *
 * Было вперемешку: «MTV / зарубежка 2000-х», «2020–2022: эпоха карантина»,
 * «Свежак: зарубежка 2023–2025» — три разных разделителя и три формата годов.
 * Стало одно правило: «<период> — <тема>», тире одно и то же, диапазоны через
 * длинное тире, тема со строчной буквы.
 *
 * Порядок — по возрастанию периода. Блоки, которые честно не привязаны к эпохе
 * (песни там с 1978 по 2018), названы «Вне времени» и расставлены передышками
 * на стыках эпох — подряд они читались как свалка в конце списка. Внутри эпох
 * порядок не рвём: «Вне времени» встаёт между группами, а не внутри.
 * Финальный блок остаётся последним.
 *
 * Запуск: node scripts/rename-blocks.cjs [--dry]
 */
const BASE = process.env.MUSIC_BASE || 'http://localhost:5000';
const CODE = process.env.GAME_CODE || '83XC';
const DRY = process.argv.includes('--dry');

// старое имя → новое, в нужном порядке
const PLAN = [
  ['Дискотека 90-х',                    '90-е — дискотека'],
  ['Песни, которые все внезапно знают',  '90-е — песни, которые все внезапно знают'],
  ['Один хит — и тишина',               '90-е — один хит и тишина'],
  ['Русский рок',                       '90–2000-е — русский рок'],
  ['Для тех, кто слушал не как все',    '90–2000-е — для тех, кто слушал не как все'],
  // передышка после ретро-блока
  ['Кино, сериалы, мульты, реклама',    'Вне времени — кино, сериалы и реклама'],
  ['Русский поп 2000-х',                '2000-е — русский поп'],
  ['MTV / зарубежка 2000-х',            '2000-е — зарубежка MTV'],
  ['Русский поп 2010-х',                '2010-е — русский поп'],
  ['Русский рэп / хип-хоп 2010-х',      '2010-е — русский рэп'],
  ['Танцпол 2010-х',                    '2010-е — танцпол'],
  ['Рок-каверы на поп-хиты',            '2010-е — рок-каверы на поп-хиты'],
  // передышка на переходе к последнему десятилетию
  ['Интернет, мемы',                    'Вне времени — интернет и мемы'],
  ['MTV 2015-2018 / EDM-pop',           '2015–2018 — EDM и MTV'],
  ['2017 — год, который все помнят',    '2017 — год, который все помнят'],
  ['2020–2022: эпоха карантина',        '2020–2022 — эпоха карантина'],
  ['Свежак: зарубежка 2023–2025',       '2023–2025 — зарубежный свежак'],
  ['Что сейчас играет у зумеров',       '2026 — что играет у зумеров'],
  // разогрев перед финалом: застольное заходит, когда все уже расслабились
  ['Под что встаёт весь зал',           'Вне времени — под что встаёт весь зал'],
  ['Финал: угадай с первых секунд',     'Финал — угадай с первых секунд'],
];

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${String(text).slice(0, 200)}`);
  return json;
}

async function main() {
  const { token } = await api('POST', '/auth/login', {
    username: process.env.MUSIC_USER || 'design_org@t.io',
    hashed_pwd: process.env.MUSIC_PWD || 'password1',
  });
  const games = await api('GET', '/music/games', null, token);
  const meta = (Array.isArray(games) ? games : games.games || []).find((g) => g.code === CODE);
  const gameId = meta._id;
  let full = await api('GET', `/music/games/${gameId}`, null, token);
  const blocks = full.game.blocks;

  if (blocks.length !== PLAN.length) {
    console.log(`!! блоков ${blocks.length}, а в плане ${PLAN.length} — проверьте план`);
  }

  const order = [];
  const missing = [];
  for (const [from, to] of PLAN) {
    // Сначала по новому имени — чтобы скрипт можно было гонять повторно,
    // когда переименование уже применено, и менять только порядок.
    const b = blocks.find((x) => x.name === to) || blocks.find((x) => x.name === from);
    if (!b) { missing.push(from); continue; }
    order.push(String(b._id));
    if (b.name !== to) {
      console.log(`  ${from}\n    → ${to}`);
      if (!DRY) await api('PATCH', `/music/games/${gameId}/blocks/${b._id}`, { name: to }, token);
    }
  }
  if (missing.length) {
    console.log('\n!! не найдены блоки (переименование пропущено):');
    missing.forEach((m) => console.log('   · ' + m));
  }
  const untouched = blocks.filter((b) => !order.includes(String(b._id)));
  if (untouched.length) {
    console.log('\n!! блоки вне плана, добавлены в конец перед финалом:');
    untouched.forEach((b) => console.log('   · ' + b.name));
    order.splice(order.length - 1, 0, ...untouched.map((b) => String(b._id)));
  }

  if (DRY) { console.log('\n(dry) ничего не менял'); return; }
  await api('PATCH', `/music/games/${gameId}`, { blockOrder: order }, token);

  full = await api('GET', `/music/games/${gameId}`, null, token);
  console.log('\nПОРЯДОК ТЕПЕРЬ:');
  full.game.blocks.forEach((b, i) => {
    const n = (b.songIds || []).length;
    console.log(`  ${String(i + 1).padStart(2)}. ${b.name}  (${n})`);
  });
}

main().catch((e) => { console.error('ОШИБКА:', e.message); process.exit(1); });
