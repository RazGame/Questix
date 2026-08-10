/*
 * E2E bundle экспорта/импорта «Угадай мелодии» (ROADMAP этап 1).
 * Запуск: NODE_PATH=frontend/node_modules node bundle-test.cjs
 * Нужен организатор design_org@t.io / password1.
 *
 * Сценарий по критерию приёмки этапа: игра с 2+ песнями → export zip →
 * удаление игры → import zip → новая игра играется (сессия доходит до playing).
 */
const { io } = require('socket.io-client');

const BASE = process.env.MUSIC_TEST_BASE || 'http://localhost:5000';
let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) { pass++; console.log('PASS:', name); } else { fail++; console.log('FAIL:', name); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body, token, opts = {}) {
  const isRaw = Buffer.isBuffer(body);
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': isRaw ? (opts.contentType || 'application/octet-stream') : 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: isRaw ? body : body ? JSON.stringify(body) : undefined,
  });
  if (opts.binary) {
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return json;
}

(async () => {
  const ts = Date.now().toString().slice(-6);
  const org = await api('POST', '/auth/login', { username: 'design_org@t.io', hashed_pwd: 'password1' });
  check('organizer login', !!org.token);

  // 1. игра с двумя «готовыми» песнями (файлы — фейковые байты, сессии всё равно)
  const { game } = await api('POST', '/music/games', { title: `Bundle Test ${ts}` }, org.token);
  const blockId = game.blocks[0]._id;

  const fakeAudio = Buffer.alloc(64 * 1024, 7); // 64 КБ мусора вместо mp3
  const songs = [];
  for (const meta of [
    { title: 'Song One', artist: 'Artist A' },
    { title: 'Song Two', artist: 'Artist B' },
  ]) {
    const { song } = await api('POST', `/music/games/${game._id}/songs`, { blockId, song: meta }, org.token);
    await api('POST', `/music/games/${game._id}/songs/${song._id}/upload?ext=mp3`, fakeAudio, org.token);
    songs.push(song);
  }
  // Отрезок задаётся отдельным PATCH (как из модалки выбора отрезка).
  // Заодно подсказка ведущему — она должна путешествовать вместе с игрой,
  // иначе после переноса на другую станцию пометки теряются.
  await api('PATCH', `/music/games/${game._id}/songs/${songs[0]._id}`,
    { startSec: 10, endSec: 40, note: 'оригинал: The Beatles' }, org.token);
  const full = await api('GET', `/music/games/${game._id}`, null, org.token);
  check('two ready songs', full.songs.filter((s) => s.status === 'ready').length === 2);

  // 2. экспорт: zip с правильной сигнатурой (константные байты сжимаются в ~ничего,
  // поэтому размер проверяем лишь на «не пустой»)
  const zip = await api('GET', `/music/games/${game._id}/export`, null, org.token, { binary: true });
  check('export is zip', zip.length > 500 && zip[0] === 0x50 && zip[1] === 0x4b); // 'PK'

  // Content-Length обязателен: по нему браузер считает проценты в окне скачивания.
  // Если архив начнут стримить или включат сжатие ответов — прогресс молча
  // выродится в бегущую полосу, и этот тест об этом скажет.
  const head = await fetch(`${BASE}/music/games/${game._id}/export`, {
    headers: { Authorization: `Bearer ${org.token}` },
  });
  check('export sends Content-Length (для прогресса)', !!head.headers.get('content-length'));
  check('export not compressed', !head.headers.get('content-encoding'));
  await head.arrayBuffer();

  // 3. удаляем оригинал
  await api('DELETE', `/music/games/${game._id}`, null, org.token);
  let gone = false;
  try { await api('GET', `/music/games/${game._id}`, null, org.token); } catch { gone = true; }
  check('original deleted', gone);

  // 4. импорт: новая игра с новым кодом и готовыми песнями
  const imported = (await api('POST', '/music/games/import', zip, org.token, { contentType: 'application/zip' })).game;
  check('import creates new game', !!imported._id && imported._id !== game._id);
  check('import new code', !!imported.code && imported.code !== game.code);
  check('import keeps title base', imported.title.startsWith(`Bundle Test ${ts}`));

  const importedFull = await api('GET', `/music/games/${imported._id}`, null, org.token);
  const readySongs = importedFull.songs.filter((s) => s.status === 'ready' && s.file);
  check('imported songs ready', readySongs.length === 2);
  const one = importedFull.songs.find((s) => s.title === 'Song One');
  check('imported segment kept', one && one.startSec === 10 && one.endSec === 40);
  check('imported note kept', one && one.note === 'оригинал: The Beatles');

  // 5. медиа реально раздаётся
  const media = await api('GET', `/media/${readySongs[0].file}`, null, null, { binary: true });
  check('imported media served', media.length === 64 * 1024);

  // 6. импортированная игра играется: lobby → start → intro → playing
  const admin = io(BASE, { transports: ['websocket'], auth: { token: org.token } });
  const screen = io(BASE, { transports: ['websocket'] });
  const player = io(BASE, { transports: ['websocket'] });
  let adminState = null;
  admin.on('state', (st) => { adminState = st; });

  admin.emit('join', { role: 'admin', gameId: imported._id });
  await sleep(200);
  screen.emit('join', { role: 'screen', gameId: imported._id });
  await sleep(150);
  screen.emit('screen:audio-ready');
  await sleep(150);
  player.emit('join', { role: 'player', code: imported.code, name: 'Импортер' });
  await sleep(300);
  player.emit('player:ready', { ready: true });
  await sleep(200);
  admin.emit('admin:start');
  await sleep(400);
  check('imported game starts (intro)', adminState && adminState.phase === 'intro');
  admin.emit('admin:continue');
  await sleep(300);
  check('imported game playing', adminState && adminState.phase === 'playing' && adminState.total === 2);

  // чистка
  admin.emit('admin:reset');
  await sleep(200);
  await api('DELETE', `/music/games/${imported._id}`, null, org.token);
  admin.close(); screen.close(); player.close();

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
