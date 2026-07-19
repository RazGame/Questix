/*
 * E2E итогов вечеринок (ROADMAP этап 5) против запущенного backend.
 * Запуск: NODE_PATH=frontend/node_modules node results-flow-test.cjs
 * Требует QUESTIX_CLOUD_URL=http://localhost:5000 у backend (loopback: станция
 * шлёт «в облако» = в саму себя; протокол тот же, что и с настоящим облаком).
 *
 * Сценарий: авторизованный игрок доигрывает угадайку до finished → снапшот
 * SessionResult → /results/my показывает вечеринку → /results/send отправляет
 * (апсерт, без дублей) → повторный send ничего не отправляет.
 */
const { io } = require('socket.io-client');

const BASE = process.env.MUSIC_TEST_BASE || 'http://localhost:5000';
let pass = 0, fail = 0;
const check = (n, ok) => { ok ? (pass++, console.log('PASS:', n)) : (fail++, console.log('FAIL:', n)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return json;
}

(async () => {
  const ts = Date.now().toString().slice(-6);
  const org = await api('POST', '/auth/login', { username: 'design_org@t.io', hashed_pwd: 'password1' });
  check('organizer login', !!org.token);

  // игрок с аккаунтом — в снапшоте будет userId, вечеринка попадёт в профиль
  try {
    await api('POST', '/auth/signup', {
      firstName: 'Res', lastName: 'T', nickname: `res${ts}`, username: `res${ts}@t.io`,
      city: 'M', phone: `+7922000${ts.slice(0, 4)}`, hashed_pwd: 'password1',
    });
  } catch {}
  const player = await api('POST', '/auth/login', { username: `res${ts}@t.io`, hashed_pwd: 'password1' });

  // игра с обязательной авторизацией + одна готовая песня
  const { game } = await api('POST', '/music/games', { title: `Party ${ts}`, auth: 'required' }, org.token);
  await api('POST', `/music/games/${game._id}/songs`, {
    blockId: game.blocks[0]._id, song: { title: 'S', artist: 'A', file: 'nofile.flac' },
  }, org.token);

  const myBefore = (await api('GET', '/results/my', null, player.token)).length;

  // доигрываем до finished
  const admin = io(BASE, { transports: ['websocket'], auth: { token: org.token } });
  const screen = io(BASE, { transports: ['websocket'] });
  const p = io(BASE, { transports: ['websocket'], auth: { token: player.token } });
  let adminState = null;
  admin.on('state', (st) => { adminState = st; });

  admin.emit('join', { role: 'admin', gameId: game._id });
  await sleep(200);
  screen.emit('join', { role: 'screen', gameId: game._id });
  await sleep(150);
  screen.emit('screen:audio-ready');
  await sleep(150);
  p.emit('join', { role: 'player', code: game.code });
  await sleep(300);
  p.emit('player:ready', { ready: true });
  await sleep(200);
  admin.emit('admin:start');
  await sleep(400);
  admin.emit('admin:continue');
  await sleep(300);
  p.emit('player:buzz');
  await sleep(250);
  admin.emit('admin:correct');
  await sleep(7500);
  check('finished', adminState && adminState.phase === 'finished');
  await sleep(500); // снапшот пишется fire-and-forget

  // вечеринка появилась в профиле игрока
  const my = await api('GET', '/results/my', null, player.token);
  check('party in /results/my', my.length === myBefore + 1);
  const party = my[0];
  check('party meta', party.title === `Party ${ts}` && party.kind === 'guess_song');
  check('party place 1, score 1', party.place === 1 && party.score === 1);

  // отправка в «облако» (loopback): всё ушло, без остатка
  const s1 = await api('POST', '/results/send', null, org.token);
  check('send: sent >= 1, failed 0', s1.sent >= 1 && s1.failed === 0 && s1.pending === 0);

  // идемпотентность: во второй раз отправлять нечего, дублей нет
  const s2 = await api('POST', '/results/send', null, org.token);
  check('second send: nothing pending', s2.sent === 0 && s2.failed === 0 && s2.pending === 0);
  const myAfter = await api('GET', '/results/my', null, player.token);
  check('no duplicates after resend', myAfter.length === myBefore + 1);

  // обычный игрок не может слать/принимать результаты
  let denied = 0;
  try { await api('POST', '/results/send', null, player.token); } catch { denied++; }
  try { await api('POST', '/results', { resultId: '00000000-0000-4000-8000-000000000000', gameId: 'x', kind: 'guess_song', title: 'x', mode: 'solo', finishedAt: new Date(), standings: [] }, player.token); } catch { denied++; }
  check('plain user denied on send/receive', denied === 2);

  await api('DELETE', `/music/games/${game._id}`, null, org.token);
  admin.close(); screen.close(); p.close();

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
