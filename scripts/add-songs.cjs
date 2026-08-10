/**
 * Наполнение игры по scripts/playlist-spec.cjs: поиск → добавление → скачивание.
 *
 * Запуск:  node scripts/add-songs.cjs [--dry]
 * --dry — только показать, что нашлось, ничего не менять.
 *
 * Идемпотентно: песня, уже присутствующая в блоке (по артисту+названию),
 * повторно не добавляется — скрипт можно перезапускать после сбоев.
 */
const { TOPUP, NEW_BLOCKS } = require('./playlist-spec.cjs');

const BASE = process.env.MUSIC_BASE || 'http://localhost:5000';
const CODE = process.env.GAME_CODE || '83XC';
const DRY = process.argv.includes('--dry');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${String(text).slice(0, 200)}`);
  return json;
}

const { pick, norm } = require('./match.cjs');

/** Поиск с повторами: каталог периодически отвечает 503. */
async function search(want, token) {
  const q = `${want.a} ${want.t}`;
  let lastErr = '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const d = await api('GET', `/music/search?q=${encodeURIComponent(q)}`, null, token);
      const list = Array.isArray(d) ? d : d.results || [];
      if (list.length) return list;
      lastErr = 'пустая выдача';
    } catch (e) {
      lastErr = e.message.slice(0, 80);
    }
    await sleep(1500 * attempt);
  }
  throw new Error(lastErr);
}

async function main() {
  const { token } = await api('POST', '/auth/login', {
    username: process.env.MUSIC_USER || 'design_org@t.io',
    hashed_pwd: process.env.MUSIC_PWD || 'password1',
  });

  const games = await api('GET', '/music/games', null, token);
  const meta = (Array.isArray(games) ? games : games.games || []).find((g) => g.code === CODE);
  if (!meta) throw new Error(`игра с кодом ${CODE} не найдена`);
  let game = await api('GET', `/music/games/${meta._id}`, null, token);
  const gameId = game.game._id;
  console.log(`Игра: ${game.game.title} (${CODE}), песен сейчас: ${game.songs.length}\n`);

  // Что уже есть — чтобы не задваивать при перезапуске
  const existing = new Set(game.songs.map((s) => norm(`${s.artist} ${s.title}`)));

  // 1. Собираем план: [{blockName, blockId|null, q, start}]
  const plan = [];
  for (const [blockName, songs] of Object.entries(TOPUP)) {
    const block = game.game.blocks.find((b) => b.name === blockName);
    if (!block) { console.log(`!! блок «${blockName}» не найден, пропускаю`); continue; }
    songs.forEach((s) => plan.push({ blockName, blockId: block._id, ...s }));
  }
  for (const nb of NEW_BLOCKS) {
    let block = game.game.blocks.find((b) => b.name === nb.name);
    if (!block) {
      if (DRY) {
        console.log(`(dry) создал бы блок «${nb.name}»`);
        nb.songs.forEach((s) => plan.push({ blockName: nb.name, blockId: null, ...s }));
        continue;
      }
      const upd = await api('POST', `/music/games/${gameId}/blocks`, { name: nb.name }, token);
      game.game = upd.game || upd;
      block = game.game.blocks.find((b) => b.name === nb.name);
      console.log(`+ блок «${nb.name}»`);
    }
    nb.songs.forEach((s) => plan.push({ blockName: nb.name, blockId: block._id, ...s }));
  }

  // 2. Поиск и добавление
  const added = [];
  const failed = [];
  const skipped = [];
  for (const item of plan) {
    let results;
    try {
      results = await search(item, token);
    } catch (e) {
      failed.push({ ...item, why: 'поиск не ответил: ' + e.message });
      continue;
    }

    const best = pick(item, results);
    if (!best.ok) {
      failed.push({ ...item, why: best.why });
      continue;
    }
    const key = norm(`${best.r.artist} ${best.r.title}`);
    if (existing.has(key)) { skipped.push({ ...item, got: `${best.r.artist} — ${best.r.title}` }); continue; }
    existing.add(key);

    const line = `${best.r.artist} — ${best.r.title}`;
    if (DRY) {
      console.log(`  [${best.s.toFixed(2)}] ${item.blockName}: ${line}`);
      added.push({ ...item, got: line });
      continue;
    }

    const { song } = await api('POST', `/music/games/${gameId}/songs`, {
      blockId: item.blockId,
      song: {
        title: best.r.title,
        artist: best.r.artist,
        album: best.r.album,
        cover: best.r.cover,
        duration: best.r.duration,
        sourceUrl: best.r.sourceUrl,
      },
    }, token);
    added.push({ ...item, songId: song._id, got: line, duration: best.r.duration });
    console.log(`  + ${item.blockName}: ${line}`);
    await sleep(150);
  }

  console.log(`\nДобавлено: ${added.length}, пропущено (уже были): ${skipped.length}, не вышло: ${failed.length}`);
  if (failed.length) {
    console.log('\nНЕ НАЙДЕНО / ПЛОХОЕ СОВПАДЕНИЕ:');
    failed.forEach((f) => console.log(`  · ${f.a} — ${f.t}  → ${f.why}`));
  }
  if (!DRY) {
    require('fs').writeFileSync(
      'scripts/added-songs.json',
      JSON.stringify({ gameId, added, failed }, null, 1)
    );
    console.log('\nсписок сохранён в scripts/added-songs.json');
  }
}

main().catch((e) => { console.error('ОШИБКА:', e.message); process.exit(1); });
