/**
 * Точечная замена песен внутри блока: убрать одни, поставить другие.
 *
 * Сейчас настроен на блок «90–2000-е — русский рок»: добавляем Animal ДжаZ —
 * «Три полоски». Освобождаем место под неё за счёт Земфиры «ИСКАЛА»: это
 * поздний трек (2013), и на фоне соседей по блоку — «Группы крови», «Выхода
 * нет», «Вечно молодой» — зал узнаёт его заметно хуже. Остальные девять песен
 * блока трогать нельзя, их подпевают хором.
 *
 * Запуск: node scripts/swap-songs.cjs [--dry]
 */
const { pick, scoreCandidate } = require('./match.cjs');

const BASE = process.env.MUSIC_BASE || 'http://localhost:5000';
const CODE = process.env.GAME_CODE || '83XC';
const DRY = process.argv.includes('--dry');

const BLOCK = '90–2000-е — русский рок';

// кого убрать (исполнитель + название, как в игре)
const REMOVE = [
  { a: 'Zemfira', t: 'ИСКАЛА' },
];

// кого поставить. start — за ~3 с до припева, отрезок 20 с.
const ADD = [
  { a: 'Animal ДжаZ', t: 'Три полоски', start: 58 },
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
    } catch { /* каталог иногда отвечает 503 */ }
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
  const block = full.game.blocks.find((b) => b.name === BLOCK);
  if (!block) throw new Error(`блок «${BLOCK}» не найден`);

  const inBlock = (s) => (block.songIds || []).some((id) => String(id) === String(s._id));
  const doomed = [];
  for (const r of REMOVE) {
    let best = null;
    for (const s of full.songs) {
      if (!inBlock(s)) continue;
      const { s: sc } = scoreCandidate(r, s);
      if (!best || sc > best.sc) best = { song: s, sc };
    }
    if (!best || best.sc < 0.7) { console.log(`  ? не нашёл в блоке: ${r.a} — ${r.t}`); continue; }
    doomed.push(best.song);
    console.log(`  − ${best.song.artist} — ${best.song.title}`);
  }

  // Сначала ставим новое и убеждаемся, что скачалось; только потом убираем старое.
  const added = [];
  for (const want of ADD) {
    const m = pick(want, await search(want, token));
    if (!m.ok) { console.log(`  ✗ ${want.a} — ${want.t}: ${m.why}`); continue; }
    console.log(`  + ${m.r.artist} — ${m.r.title}`);
    if (DRY) { added.push(want); continue; }

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
      console.log('    не скачалась — откатываю');
      await api('DELETE', `/music/games/${gameId}/songs/${song._id}`, null, token).catch(() => {});
      continue;
    }
    await api('PATCH', `/music/games/${gameId}/songs/${song._id}`,
      { startSec: want.start, endSec: want.start + 20, note: want.note }, token);
    added.push(want);
  }

  if (DRY) { console.log('\n(dry) ничего не менял'); return; }
  if (added.length !== ADD.length) {
    console.log('\n!! не все новые встали — старые НЕ удаляю');
    return;
  }
  for (const s of doomed) await api('DELETE', `/music/games/${gameId}/songs/${s._id}`, null, token);

  full = await api('GET', `/music/games/${gameId}`, null, token);
  const b2 = full.game.blocks.find((x) => String(x._id) === String(block._id));
  console.log(`\n«${b2.name}»:`);
  (b2.songIds || []).forEach((id) => {
    const s = full.songs.find((x) => String(x._id) === String(id));
    if (s) console.log(`  ${s.artist} — ${s.title}\n      ${s.note || '— без подсказки —'}`);
  });
  console.log(`\nвсего песен в игре: ${full.songs.length}`);
}

main().catch((e) => { console.error('ОШИБКА:', e.message); process.exit(1); });
