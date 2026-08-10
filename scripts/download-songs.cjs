/**
 * Скачивание файлов для песен без аудио: пачками по 4, с повторами.
 * Запуск: node scripts/download-songs.cjs
 *
 * Идемпотентно — берёт только те песни, у которых нет файла, поэтому
 * можно запускать повторно, пока не останется ошибок.
 */
const BASE = process.env.MUSIC_BASE || 'http://localhost:5000';
const CODE = process.env.GAME_CODE || '83XC';
const PARALLEL = Number(process.env.PARALLEL || 4);
const ATTEMPTS = Number(process.env.ATTEMPTS || 2);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
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

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const full = await api('GET', `/music/games/${gameId}`, null, token);
    const todo = full.songs.filter((s) => s.status !== 'ready');
    if (!todo.length) { console.log('\nвсе песни скачаны'); break; }

    console.log(`\n=== заход ${attempt}: качаем ${todo.length} шт. по ${PARALLEL} параллельно ===`);
    for (let i = 0; i < todo.length; i += PARALLEL) {
      const batch = todo.slice(i, i + PARALLEL);
      await Promise.all(batch.map((s) =>
        api('POST', `/music/games/${gameId}/songs/${s._id}/download`, null, token).catch(() => {})
      ));

      // ждём, пока пачка отработает (или упрётся в таймаут)
      const ids = new Set(batch.map((s) => String(s._id)));
      for (let w = 0; w < 60; w++) {
        await sleep(3000);
        const cur = await api('GET', `/music/games/${gameId}`, null, token);
        const still = cur.songs.filter((s) => ids.has(String(s._id)) && (s.status === 'pending' || s.status === 'downloading'));
        if (!still.length) break;
      }
      const cur = await api('GET', `/music/games/${gameId}`, null, token);
      const done = cur.songs.filter((s) => ids.has(String(s._id)));
      done.forEach((s) => console.log(`  ${s.status === 'ready' ? '♪' : '✗'} ${s.artist} — ${s.title}${s.status !== 'ready' ? ' (' + (s.error || s.status) + ')' : ''}`));
      const ok = cur.songs.filter((s) => s.status === 'ready').length;
      console.log(`  … готово ${ok} из ${cur.songs.length}`);
    }
  }

  const full = await api('GET', `/music/games/${gameId}`, null, token);
  const bad = full.songs.filter((s) => s.status !== 'ready');
  console.log(`\nИТОГ: ${full.songs.length - bad.length} из ${full.songs.length} с файлом`);
  if (bad.length) {
    console.log('БЕЗ ФАЙЛА:');
    bad.forEach((s) => console.log(`  · ${s.artist} — ${s.title} (${s.error || s.status})`));
  }
}

main().catch((e) => { console.error('ОШИБКА:', e.message); process.exit(1); });
