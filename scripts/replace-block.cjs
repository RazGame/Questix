/**
 * Замена блока «2023–2025 — зарубежный свежак» на «2020-е — кино и сериалы».
 *
 * Почему: в 2026-м «свежак» из 2023-го уже не свежак, а главное — зарубежный
 * поп последних лет наша аудитория (коллеги 22–40) знает хуже всего, зал бы
 * молчал. Кино и сериалы узнаются не по чартам, а по сериалу, который смотрели
 * все, — попадание кратно выше. Получается пара к блоку «Вне времени — кино,
 * сериалы и реклама», где всё до 2012 года.
 *
 * Оригинал Kate Bush не берём: кавер Loveless уже стоит в блоке рок-каверов,
 * иначе одна песня оказалась бы в игре дважды.
 *
 * Запуск: node scripts/replace-block.cjs [--dry]
 */
const { pick } = require('./match.cjs');

const BASE = process.env.MUSIC_BASE || 'http://localhost:5000';
const CODE = process.env.GAME_CODE || '83XC';
const DRY = process.argv.includes('--dry');

const OLD_NAME = '2023–2025 — зарубежный свежак';
const NEW_NAME = '2020-е — кино и сериалы';

// a/t — исполнитель и название, start — за ~3 с до припева,
// note — подсказка ведущему: засчитывать название фильма или сериала.
const SONGS = [
  { a: 'AIGEL', t: 'Пыяла', start: 44, note: 'сериал «Слово пацана»' },
  { a: 'Metallica', t: 'Master Of Puppets', start: 60, note: 'сериал «Очень странные дела» — сцена Эдди' },
  { a: 'Lady Gaga', t: 'Bloody Mary', start: 46, note: 'сериал «Уэнсдэй»' },
  { a: 'The Cramps', t: 'Goo Goo Muck', start: 32, note: 'сериал «Уэнсдэй» — под это она танцует' },
  { a: 'Billie Eilish', t: 'No Time To Die', start: 56, note: 'фильм «Не время умирать», Бонд' },
  { a: 'Dua Lipa', t: 'Dance The Night', start: 42, note: 'фильм «Барби»' },
  { a: 'OneRepublic', t: "I Ain't Worried", start: 38, note: 'фильм «Топ Ган: Мэверик»' },
  { a: 'Labrinth', t: "Still Don't Know My Name", start: 50, note: 'сериал «Эйфория»' },
  { a: 'Imagine Dragons', t: 'Enemy', start: 40, note: 'сериал «Аркейн» по League of Legends' },
  { a: 'Sonya Belousova', t: 'Toss A Coin To Your Witcher', start: 34, note: 'сериал «Ведьмак» — «заплатите чеканной монетой»' },
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
  const block = full.game.blocks.find((b) => b.name === OLD_NAME || b.name === NEW_NAME);
  if (!block) throw new Error(`блок «${OLD_NAME}» не найден`);

  const oldSongs = (block.songIds || [])
    .map((id) => full.songs.find((s) => String(s._id) === String(id)))
    .filter(Boolean);
  console.log(`убираем из «${block.name}»: ${oldSongs.length} песен`);
  oldSongs.forEach((s) => console.log(`  − ${s.artist} — ${s.title}`));

  // Сначала добавляем новое и убеждаемся, что скачалось, и только потом
  // удаляем старое: если источник подведёт, игра не останется с дырой.
  const added = [];
  const failed = [];
  for (const want of SONGS) {
    const list = await search(want, token);
    const m = pick(want, list);
    if (!m.ok) { failed.push({ ...want, why: m.why || 'не найдено' }); continue; }
    console.log(`  + ${m.r.artist} — ${m.r.title}`);
    if (DRY) { added.push({ want, got: m.r }); continue; }

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
      failed.push({ ...want, why: 'не скачалась' });
      await api('DELETE', `/music/games/${gameId}/songs/${song._id}`, null, token).catch(() => {});
      continue;
    }
    await api('PATCH', `/music/games/${gameId}/songs/${song._id}`,
      { startSec: want.start, endSec: want.start + 20, note: want.note }, token);
    added.push({ want, songId: song._id });
  }

  console.log(`\nдобавлено: ${added.length}, не вышло: ${failed.length}`);
  failed.forEach((f) => console.log(`  · ${f.a} — ${f.t}: ${f.why}`));

  if (DRY) { console.log('\n(dry) ничего не менял'); return; }
  if (added.length < SONGS.length) {
    console.log('\n!! часть песен не добавилась — старые НЕ удаляю, разберитесь сначала');
    return;
  }

  for (const s of oldSongs) {
    await api('DELETE', `/music/games/${gameId}/songs/${s._id}`, null, token);
  }
  await api('PATCH', `/music/games/${gameId}/blocks/${block._id}`, { name: NEW_NAME }, token);

  full = await api('GET', `/music/games/${gameId}`, null, token);
  const b2 = full.game.blocks.find((x) => String(x._id) === String(block._id));
  console.log(`\n«${b2.name}» теперь:`);
  (b2.songIds || []).forEach((id) => {
    const s = full.songs.find((x) => String(x._id) === String(id));
    if (s) console.log(`  ${s.artist} — ${s.title}  [${s.startSec}–${s.endSec}]  ${s.note || ''}`);
  });
  console.log(`\nвсего песен в игре: ${full.songs.length}`);
}

main().catch((e) => { console.error('ОШИБКА:', e.message); process.exit(1); });
