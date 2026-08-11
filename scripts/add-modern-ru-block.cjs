/**
 * Новый блок в 83XC: русские хиты последних лет, которые узнаёт весь зал.
 *
 * Почему именно эти. В игре уже есть русский поп 2000-х и 2010-х, рэп 2010-х,
 * карантинные 2020–2022 и совсем свежий блок «что играет у зумеров». Провал —
 * ровно между ними: 2018–2023, когда вышло то, что коллеги 22–40 слышали из
 * каждой колонки и подпевают до сих пор. Берём только то, чего в игре ещё нет,
 * и только российское.
 *
 * start — за ~3 секунды до припева, отрезок 20 секунд. Значения проставлены
 * по знанию треков: автоопределение припева на этой библиотеке не работает
 * (проверял, лучший результат был 11% попаданий), поэтому лучше честно руками.
 *
 * Запуск: node scripts/add-modern-ru-block.cjs [--dry]
 * Идемпотентно: уже добавленные песни пропускаются.
 */
const { pick, scoreCandidate } = require('./match.cjs');

const BASE = process.env.MUSIC_BASE || 'http://localhost:5000';
const CODE = process.env.GAME_CODE || '83XC';
const DRY = process.argv.includes('--dry');

const BLOCK = '2018–2023 — русские хиты, которые знают все';
// встаёт сразу за этим блоком: дальше по времени идёт карантин
const AFTER = '2017 — год, который все помнят';

const SONGS = [
  { a: 'Rauf & Faik', t: 'Детство', start: 48 },
  { a: 'Тима Белорусских', t: 'Незабудка', start: 42 },
  { a: 'Артур Пирожков', t: 'Зацепила', start: 46, note: 'Артур Пирожков — это Александр Ревва' },
  { a: 'JONY', t: 'Комета', start: 50 },
  { a: 'NILETTO', t: 'Любимка', start: 36 },
  { a: 'Джарахов', t: 'Я в моменте', start: 42, note: 'вместе с Markul' },
  { a: 'Хабиб', t: 'Ягода малинка', start: 36, note: 'засчитывать просто «малинку»' },
  { a: 'GAYAZOV$ BROTHER$', t: 'Малиновая Лада', start: 50 },
  { a: 'ANNA ASTI', t: 'Феникс', start: 50, note: 'ANNA ASTI — бывшая солистка ARTIK & ASTI' },
  { a: 'MACAN', t: 'Кино', start: 46, note: 'песня называется «Кино» — с группой «Кино» не путать' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${String(text).slice(0, 150)}`);
  return json;
}

async function search(want, token) {
  for (let i = 1; i <= 4; i++) {
    try {
      const d = await api('GET', `/music/search?q=${encodeURIComponent(`${want.a} ${want.t}`)}`, null, token);
      const list = Array.isArray(d) ? d : d.results || [];
      if (list.length) return list;
    } catch { /* каталог иногда отвечает 503 — пробуем ещё */ }
    await sleep(1500 * i);
  }
  return [];
}

async function main() {
  const { token } = await api('POST', '/auth/login', {
    username: process.env.MUSIC_USER || 'design_org@t.io',
    hashed_pwd: process.env.MUSIC_PWD || 'password1',
  });
  const games = await api('GET', '/music/games', null, token);
  const meta = (Array.isArray(games) ? games : games.games || []).find((g) => g.code === CODE);
  if (!meta) throw new Error(`игра ${CODE} не найдена (нет доступа?)`);
  const gameId = meta._id;
  let full = await api('GET', `/music/games/${gameId}`, null, token);

  // 1. блок
  let block = full.game.blocks.find((b) => b.name === BLOCK);
  if (!block) {
    if (DRY) {
      console.log(`(dry) создал бы блок «${BLOCK}»`);
    } else {
      // POST отдаёт только game, без songs — перечитываем игру целиком
      await api('POST', `/music/games/${gameId}/blocks`, { name: BLOCK }, token);
      full = await api('GET', `/music/games/${gameId}`, null, token);
      block = full.game.blocks.find((b) => b.name === BLOCK);
      console.log(`блок «${BLOCK}» создан`);
    }
  } else {
    console.log(`блок «${BLOCK}» уже есть`);
  }

  // 2. песни
  const inGame = (want) => full.songs.find((s) => scoreCandidate(want, s).s >= 0.75);
  for (const want of SONGS) {
    const dup = inGame(want);
    if (dup) { console.log(`  = уже в игре: ${dup.artist} — ${dup.title}`); continue; }

    const m = pick(want, await search(want, token));
    if (!m.ok) { console.log(`  ✗ ${want.a} — ${want.t}: ${m.why}`); continue; }
    console.log(`  + ${m.r.artist} — ${m.r.title}`);
    if (DRY) continue;

    const { song } = await api('POST', `/music/games/${gameId}/songs`, {
      blockId: block._id,
      song: {
        title: m.r.title, artist: m.r.artist, album: m.r.album,
        cover: m.r.cover, duration: m.r.duration, sourceUrl: m.r.sourceUrl,
      },
    }, token);

    let ready = false;
    for (let i = 0; i < 45; i++) {
      await sleep(3000);
      const cur = await api('GET', `/music/games/${gameId}`, null, token);
      const s = cur.songs.find((x) => String(x._id) === String(song._id));
      if (s?.status === 'ready') { ready = true; break; }
      if (s?.status === 'error') break;
    }
    if (!ready) {
      console.log('      не скачалась — убираю');
      await api('DELETE', `/music/games/${gameId}/songs/${song._id}`, null, token).catch(() => {});
      continue;
    }
    await api('PATCH', `/music/games/${gameId}/songs/${song._id}`, {
      startSec: want.start, endSec: want.start + 20, ...(want.note ? { note: want.note } : {}),
    }, token);
    full = await api('GET', `/music/games/${gameId}`, null, token);
  }

  if (DRY) { console.log('\n(dry) ничего не сохранял'); return; }

  // 3. место блока: сразу за AFTER, остальной порядок не трогаем
  full = await api('GET', `/music/games/${gameId}`, null, token);
  const mine = String(full.game.blocks.find((b) => b.name === BLOCK)._id);
  const anchor = full.game.blocks.find((b) => b.name === AFTER);
  if (anchor) {
    const order = full.game.blocks.map((b) => String(b._id)).filter((id) => id !== mine);
    order.splice(order.indexOf(String(anchor._id)) + 1, 0, mine);
    await api('PATCH', `/music/games/${gameId}`, { blockOrder: order }, token);
  }

  full = await api('GET', `/music/games/${gameId}`, null, token);
  const b2 = full.game.blocks.find((b) => b.name === BLOCK);
  console.log(`\n«${b2.name}» (${(b2.songIds || []).length}):`);
  (b2.songIds || []).forEach((id) => {
    const s = full.songs.find((x) => String(x._id) === String(id));
    if (s) console.log(`  ${s.artist} — ${s.title}   ${s.startSec}–${s.endSec}с${s.note ? `\n      ${s.note}` : ''}`);
  });
  console.log('\nпорядок блоков:');
  full.game.blocks.forEach((b, i) => console.log(`  ${String(i + 1).padStart(2)}. ${b.name}`));
  console.log(`\nвсего песен в игре: ${full.songs.length}`);
}

main().catch((e) => { console.error('ОШИБКА:', e.message); process.exit(1); });
