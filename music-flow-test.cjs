/*
 * E2E-проверка realtime «Угадай мелодию» против запущенного backend (localhost:5000).
 * Запуск: NODE_PATH=frontend/node_modules node music-flow-test.cjs
 * Нужен организатор design_org@t.io / password1 (из seed-demo.ps1).
 */
const { io } = require('socket.io-client');

const BASE = 'http://localhost:5000';
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
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return json;
}

(async () => {
  // 1. логин организатора
  const login = await api('POST', '/auth/login', { username: 'design_org@t.io', hashed_pwd: 'password1' });
  const token = login.token;
  check('organizer login', !!token);

  // 2. создать музыкальную игру
  const { game } = await api('POST', '/music/games', { title: 'Flow Test' }, token);
  check('create music game', !!game._id && game.kind === 'guess_song' && !!game.code);

  // 3. угадайки нет в каталоге квестов
  const catalog = await api('GET', '/games', null, token);
  check('guess_song hidden from catalog', !catalog.some((g) => g._id === game._id));

  // 4. добавить песню (file задан → статус ready, без реального аудио)
  const blockId = game.blocks[0]._id;
  const { song } = await api('POST', `/music/games/${game._id}/songs`, {
    blockId, song: { title: 'Test Song', artist: 'Tester', file: 'nofile.flac' },
  }, token);
  check('add ready song', song.status === 'ready');

  // 5. сокеты: ведущий + экран + игрок
  const admin = io(BASE, { transports: ['websocket'], auth: { token } });
  const screen = io(BASE, { transports: ['websocket'] });
  const player = io(BASE, { transports: ['websocket'] });
  let adminState = null, playerState = null, playerId = null;
  admin.on('state', (st) => { adminState = st; });
  player.on('state', (st) => { playerState = st; });
  player.on('joined', (d) => { playerId = d.playerId; });

  admin.emit('join', { role: 'admin', gameId: game._id });
  await sleep(200);
  // экран присоединяется и сообщает, что звук разблокирован (старт этого требует)
  screen.emit('join', { role: 'screen', gameId: game._id });
  await sleep(200);
  screen.emit('screen:audio-ready');
  await sleep(200);
  player.emit('join', { role: 'player', code: game.code, name: 'Игрок1' });
  await sleep(400);
  check('admin sees lobby', adminState && adminState.phase === 'lobby');
  check('player joined', !!playerId && playerState && playerState.players.length === 1);

  // 6. игрок готов, ведущий стартует
  player.emit('player:ready', { ready: true });
  await sleep(200);
  admin.emit('admin:start');
  await sleep(400);
  check('phase playing after start', adminState && adminState.phase === 'playing');
  check('player armed', playerState && playerState.players[0].armed);

  // 7. баззер
  player.emit('player:buzz');
  await sleep(300);
  check('phase buzzed', adminState && adminState.phase === 'buzzed' && adminState.buzzed && adminState.buzzed.name === 'Игрок1');

  // 8. правильно → reveal → (доигрыш+фейд) → finished (одна песня)
  admin.emit('admin:correct');
  await sleep(300);
  check('phase reveal + score', adminState && adminState.phase === 'reveal' && adminState.players[0].score === 1);
  await sleep(7200);
  check('phase finished after single song', adminState && adminState.phase === 'finished');

  // 9. неверный ответ блокирует игрока (новый прогон)
  admin.emit('admin:reset');
  await sleep(300);
  player.emit('player:ready', { ready: true });
  await sleep(150);
  admin.emit('admin:start');
  await sleep(300);
  player.emit('player:buzz');
  await sleep(250);
  admin.emit('admin:wrong');
  await sleep(300);
  check('wrong locks player + resumes', adminState && adminState.phase === 'playing' && playerState.players[0].locked === true);

  // очистка
  await api('DELETE', `/music/games/${game._id}`, null, token);
  admin.close(); player.close(); screen.close();

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
