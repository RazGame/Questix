/*
 * E2E командной «Угадай мелодии» против запущенного backend (localhost:5000).
 * Запуск: NODE_PATH=frontend/node_modules node team-guess-song-test.cjs
 * Нужен организатор design_org@t.io / password1 (из seed-demo.ps1).
 *
 * Проверяем: командная игра форсит auth=required; игроки группируются по
 * командам Questix; счёт и блокировка баззера — по команде; игрок без
 * команды отклоняется.
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

let phoneSeq = 30;
async function ensureUser(nick, mail) {
  const phone = `+7000000${String(phoneSeq++).padStart(4, '0')}`;
  try {
    await api('POST', '/auth/signup', {
      firstName: nick, lastName: 'T', nickname: nick, username: mail,
      city: 'M', phone, hashed_pwd: 'password1',
    });
  } catch {}
  return api('POST', '/auth/login', { username: mail, hashed_pwd: 'password1' });
}

(async () => {
  const ts = Date.now().toString().slice(-6);
  const org = await api('POST', '/auth/login', { username: 'design_org@t.io', hashed_pwd: 'password1' });
  check('organizer login', !!org.token);

  // 1. командная музыкальная игра — auth должен форситься в required
  const { game } = await api('POST', '/music/games', { title: `Team Music ${ts}`, participation: 'team', auth: 'open' }, org.token);
  check('create team music game', !!game._id && game.kind === 'guess_song');
  check('team game participation=team', game.participation === 'team');
  check('team game forces auth=required', game.auth === 'required');

  // 2. публичная мета отдаёт командный режим
  const meta = await api('GET', `/music/public/${game.code}`, null);
  check('public meta team+required', meta.participation === 'team' && meta.auth === 'required');

  // 3. готовим игроков и две команды Questix
  const capA = await ensureUser(`capA${ts}`, `capa${ts}@t.io`);
  const memA = await ensureUser(`memA${ts}`, `mema${ts}@t.io`);
  const capB = await ensureUser(`capB${ts}`, `capb${ts}@t.io`);
  const memB = await ensureUser(`memB${ts}`, `memb${ts}@t.io`);
  const loner = await ensureUser(`lone${ts}`, `lone${ts}@t.io`); // без команды
  check('players ready', !!capA.token && !!memA.token && !!capB.token && !!memB.token && !!loner.token);

  const teamA = (await api('POST', '/teams', { name: `Альфа ${ts}` }, capA.token)).team;
  await api('POST', `/teams/${teamA._id}/members`, { nickname: `memA${ts}` }, capA.token);
  const teamB = (await api('POST', '/teams', { name: `Бета ${ts}` }, capB.token)).team;
  await api('POST', `/teams/${teamB._id}/members`, { nickname: `memB${ts}` }, capB.token);
  check('two teams created', !!teamA._id && !!teamB._id);

  // 4. готовая песня
  const blockId = game.blocks[0]._id;
  await api('POST', `/music/games/${game._id}/songs`, {
    blockId, song: { title: 'Team Song', artist: 'Tester', file: 'nofile.flac' },
  }, org.token);

  // 5. сокеты
  const admin = io(BASE, { transports: ['websocket'], auth: { token: org.token } });
  const screen = io(BASE, { transports: ['websocket'] });
  const mkPlayer = (tok) => {
    const s = io(BASE, { transports: ['websocket'], auth: { token: tok } });
    const ctx = { sock: s, state: null, joined: null, error: null };
    s.on('state', (st) => { ctx.state = st; });
    s.on('joined', (d) => { ctx.joined = d; });
    s.on('error-msg', (e) => { ctx.error = e.message; });
    return ctx;
  };
  let adminState = null;
  admin.on('state', (st) => { adminState = st; });

  admin.emit('join', { role: 'admin', gameId: game._id });
  await sleep(200);
  screen.emit('join', { role: 'screen', gameId: game._id });
  await sleep(150);
  screen.emit('screen:audio-ready');
  await sleep(150);

  const pCapA = mkPlayer(capA.token);
  const pMemA = mkPlayer(memA.token);
  const pCapB = mkPlayer(capB.token);
  const pMemB = mkPlayer(memB.token);
  pCapA.sock.emit('join', { role: 'player', code: game.code });
  pMemA.sock.emit('join', { role: 'player', code: game.code });
  pCapB.sock.emit('join', { role: 'player', code: game.code });
  pMemB.sock.emit('join', { role: 'player', code: game.code });
  await sleep(500);

  check('mode=team in state', adminState && adminState.mode === 'team');
  check('player gets team on join', pMemA.joined && pMemA.joined.teamName === `Альфа ${ts}`);
  check('two teams in scoreboard', adminState && adminState.teams && adminState.teams.length === 2);

  // игрок без команды отклоняется
  const pLone = mkPlayer(loner.token);
  pLone.sock.emit('join', { role: 'player', code: game.code });
  await sleep(300);
  check('loner without team rejected', !!pLone.error && pLone.joined === null);

  // 6. все готовы, старт
  pCapA.sock.emit('player:ready', { ready: true });
  pMemA.sock.emit('player:ready', { ready: true });
  pCapB.sock.emit('player:ready', { ready: true });
  pMemB.sock.emit('player:ready', { ready: true });
  await sleep(200);
  admin.emit('admin:start');
  await sleep(400);
  check('phase playing', adminState && adminState.phase === 'playing');

  // 7. участник команды Альфа жмёт — баззер привязан к команде
  pMemA.sock.emit('player:buzz');
  await sleep(300);
  check('buzzed by team name', adminState && adminState.phase === 'buzzed'
    && adminState.buzzed && adminState.buzzed.name === `Альфа ${ts}`);
  check('buzzed carries who pressed', adminState.buzzed && adminState.buzzed.by === `memA${ts}`);

  // 8. правильно → очко команде Альфа (а не игроку)
  admin.emit('admin:correct');
  await sleep(300);
  const alphaScore = adminState.teams.find((t) => t.name === `Альфа ${ts}`);
  check('team Альфа scored', alphaScore && alphaScore.score === 1);
  await sleep(7200);
  check('finished after single song', adminState && adminState.phase === 'finished');

  // 9. неверный ответ блокирует всю команду, соперники свободны
  admin.emit('admin:reset');
  await sleep(300);
  pCapA.sock.emit('player:ready', { ready: true });
  pMemA.sock.emit('player:ready', { ready: true });
  pCapB.sock.emit('player:ready', { ready: true });
  pMemB.sock.emit('player:ready', { ready: true });
  await sleep(150);
  admin.emit('admin:start');
  await sleep(300);
  pMemB.sock.emit('player:buzz'); // команда Бета
  await sleep(250);
  admin.emit('admin:wrong');
  await sleep(350);
  const teamBlocked = adminState.teams.find((t) => t.name === `Бета ${ts}`);
  const capBState = adminState.players.find((p) => p.id === pCapB.joined.playerId);
  const memAState = adminState.players.find((p) => p.id === pMemA.joined.playerId);
  check('phase resumed playing', adminState.phase === 'playing');
  check('whole team Бета locked', teamBlocked && teamBlocked.locked === true);
  check('teammate capB locked too', capBState && capBState.locked === true);
  check('rival team Альфа still armed', memAState && memAState.armed === true && memAState.locked === false);

  // очистка
  await api('DELETE', `/music/games/${game._id}`, null, org.token);
  await api('DELETE', `/teams/${teamA._id}`, null, capA.token).catch(() => {});
  await api('DELETE', `/teams/${teamB._id}`, null, capB.token).catch(() => {});
  admin.close(); screen.close();
  pCapA.sock.close(); pMemA.sock.close(); pCapB.sock.close(); pMemB.sock.close(); pLone.sock.close();

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
