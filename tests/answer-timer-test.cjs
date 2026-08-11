/*
 * Счётчик времени на ответ: параметр игры answerSeconds.
 * Запуск: NODE_PATH=frontend/node_modules node tests/answer-timer-test.cjs
 *
 * Проверяет три вещи, ради которых счётчик и делался: он виден игрокам,
 * замирает на паузе ведущего и по истечении сам засчитывает промах.
 */
const { io } = require('socket.io-client');

const BASE = process.env.MUSIC_TEST_BASE || 'http://127.0.0.1:5000';
let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) { pass++; console.log('PASS:', name); } else { fail++; console.log('FAIL:', name); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${String(text).slice(0, 160)}`);
  return json;
}

const waitFor = async (predicate, ms = 8000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (predicate()) return true;
    await sleep(120);
  }
  return false;
};

(async () => {
  const { token } = await api('POST', '/auth/login', { username: 'design_org@t.io', hashed_pwd: 'password1' });
  const { game } = await api('POST', '/music/games', { title: `Answer timer ${Date.now()}` }, token);

  // Верхняя граница: полторы минуты ожидания на вечеринке — уже не игра.
  let rejected = false;
  try { await api('PATCH', `/music/games/${game._id}`, { answerSeconds: 300 }, token); }
  catch { rejected = true; }
  check('слишком большое время не принимается', rejected);

  const updated = await api('PATCH', `/music/games/${game._id}`, { answerSeconds: 5 }, token);
  check('время на ответ сохраняется', updated.game.answerSeconds === 5);

  await api('POST', `/music/games/${game._id}/songs`, {
    blockId: game.blocks[0]._id, song: { title: 'A', artist: 'T', file: 'nofile.flac' },
  }, token);

  const admin = io(BASE, { transports: ['websocket'], auth: { token } });
  const screen = io(BASE, { transports: ['websocket'] });
  const player = io(BASE, { transports: ['websocket'] });
  let adminState = null, playerState = null, playerId = null;
  admin.on('state', (st) => { adminState = st; });
  player.on('state', (st) => { playerState = st; });
  player.on('joined', (d) => { playerId = d.playerId; });

  admin.emit('join', { role: 'admin', gameId: game._id });
  await sleep(200);
  screen.emit('join', { role: 'screen', gameId: game._id });
  await sleep(150);
  screen.emit('screen:audio-ready');
  await sleep(150);
  player.emit('join', { role: 'player', code: game.code, name: 'Игрок' });
  await waitFor(() => !!playerId);
  player.emit('player:ready', { ready: true });
  await sleep(150);

  admin.emit('admin:start');
  const started = await waitFor(() => adminState?.phase === 'playing', 16000);
  check('игра дошла до песни', started);

  player.emit('player:buzz');
  const buzzed = await waitFor(() => adminState?.phase === 'buzzed');
  check('нажатие принято', buzzed);
  check('счётчик виден игроку', playerState?.answerTotalMs === 5000 && playerState?.answerLeftMs > 0);
  check('момент истечения передан', !!playerState?.answerEndsAt);

  // Пауза посреди ответа: счётчик замирает, а не продолжает утекать.
  admin.emit('admin:pause');
  await waitFor(() => adminState?.paused === true);
  const frozen = adminState?.answerLeftMs;
  check('на паузе момента истечения нет', adminState?.answerEndsAt == null);
  await sleep(1500);
  check('на паузе остаток не убывает', adminState?.answerLeftMs === frozen);
  check('фаза на паузе прежняя', adminState?.phase === 'buzzed');

  admin.emit('admin:resume');
  await waitFor(() => adminState?.paused === false);
  check('после продолжения счётчик снова идёт', !!adminState?.answerEndsAt);

  // Ведущий молчит — время выходит, ответ считается неверным.
  const timedOut = await waitFor(() => adminState?.phase === 'playing', 9000);
  check('по истечении раунд продолжается сам', timedOut);
  const me = adminState?.players?.find((p) => p.id === playerId);
  check('очки за просроченный ответ не начислены', me && me.score === 0);
  check('счётчик погашен', adminState?.answerLeftMs == null);

  // Без счётчика всё как раньше: нажали и ждём ведущего сколько угодно.
  await api('PATCH', `/music/games/${game._id}`, { answerSeconds: 0 }, token);
  admin.emit('admin:reset');
  await waitFor(() => adminState?.phase === 'lobby');
  player.emit('player:ready', { ready: true });
  await sleep(200);
  admin.emit('admin:start');
  await waitFor(() => adminState?.phase === 'playing', 16000);
  player.emit('player:buzz');
  await waitFor(() => adminState?.phase === 'buzzed');
  check('без счётчика полей времени нет', adminState?.answerTotalMs == null && adminState?.answerEndsAt == null);
  await sleep(2500);
  check('без счётчика раунд ждёт ведущего', adminState?.phase === 'buzzed');

  await api('DELETE', `/music/games/${game._id}`, null, token);
  admin.close(); screen.close(); player.close();

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ОШИБКА:', e.message); process.exit(1); });
