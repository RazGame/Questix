/*
 * E2E командной «Угадай мелодии» БЕЗ регистрации (team + open, ad-hoc команды).
 * Запуск: NODE_PATH=frontend/node_modules node team-open-guess-song-test.cjs
 * Нужен организатор design_org@t.io / password1.
 *
 * Проверяем: командная игра может быть auth=open; анонимы объединяются в
 * команды по названию (регистр не важен); счёт/блокировка — по команде;
 * вход без названия команды отклоняется.
 */
const { io } = require('socket.io-client');

const BASE = process.env.MUSIC_TEST_BASE || 'http://localhost:5000';
let pass = 0, fail = 0;
const check = (n, ok) => { ok ? (pass++, console.log('PASS:', n)) : (fail++, console.log('FAIL:', n)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ждём наступления условия, а не «столько-то миллисекунд». Фиксированные паузы
// делали тест плавающим: под нагрузкой ответ не успевал прийти, а главное —
// порядок подключения независимых сокетов не гарантирован.
const waitFor = async (pred, ms = 4000, step = 25) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (pred()) return true;
    await sleep(step);
  }
  return false;
};

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

  // 1. команда + без авторизации — теперь валидная комбинация
  const { game } = await api('POST', '/music/games', { title: `Party Team ${ts}`, participation: 'team', auth: 'open' }, org.token);
  check('team+open game created', game.participation === 'team' && game.auth === 'open');
  const meta = await api('GET', `/music/public/${game.code}`, null);
  check('public meta team+open', meta.participation === 'team' && meta.auth === 'open');

  await api('POST', `/music/games/${game._id}/songs`, {
    blockId: game.blocks[0]._id, song: { title: 'S', artist: 'A', file: 'nofile.flac' },
  }, org.token);

  // 2. сокеты: анонимы с названиями команд
  const admin = io(BASE, { transports: ['websocket'], auth: { token: org.token } });
  const screen = io(BASE, { transports: ['websocket'] });
  const mkAnon = () => {
    const s = io(BASE, { transports: ['websocket'] });
    const ctx = { sock: s, joined: null, error: null };
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

  // peek: телефон на экране входа видит уже созданные команды до своего входа
  const peeker = mkAnon();
  let peekState = null;
  peeker.sock.on('state', (st) => { peekState = st; });

  const a1 = mkAnon(); const a2 = mkAnon(); const b1 = mkAnon(); const noTeam = mkAnon();
  // Аня входит ПЕРВОЙ и создаёт команду — значит её написание и станет
  // отображаемым. Без этого ожидания порядок подключения сокетов случаен:
  // если первым успевал Боря, команда называлась «стол 1» строчными,
  // и проверки ниже падали на ровном месте.
  a1.sock.emit('join', { role: 'player', code: game.code, name: 'Аня', teamName: 'Стол 1' });
  await waitFor(() => a1.joined);
  a2.sock.emit('join', { role: 'player', code: game.code, name: 'Боря', teamName: 'стол 1' }); // регистр не важен
  b1.sock.emit('join', { role: 'player', code: game.code, name: 'Вера', teamName: 'Стол 2' });
  noTeam.sock.emit('join', { role: 'player', code: game.code, name: 'Гоша' }); // без команды
  await waitFor(() => adminState && adminState.teams.length === 2 && a2.joined && b1.joined);
  await waitFor(() => noTeam.error); // отказ приходит отдельным сообщением

  check('anon joined with team', a1.joined && a1.joined.teamName === 'Стол 1');
  check('case-insensitive team merge', adminState && adminState.teams.length === 2);
  check('no team -> rejected', !!noTeam.error && noTeam.joined === null);

  // peek не входит в игру, но видит список команд для выбора
  peeker.sock.emit('peek', { code: game.code });
  await waitFor(() => peekState && peekState.teams.length === 2);
  check('peek sees existing teams', peekState && peekState.teams.length === 2
    && peekState.teams.some((t) => t.name === 'Стол 1'));
  check('peek is not a player', peeker.joined === null
    && !adminState.players.some((p) => p.name === undefined));
  const playersBefore = adminState.players.length;

  // и получает обновления живьём, когда кто-то создаёт новую команду
  const c1 = mkAnon();
  c1.sock.emit('join', { role: 'player', code: game.code, name: 'Дима', teamName: 'Стол 3' });
  await waitFor(() => peekState && peekState.teams.length === 3 && c1.joined);
  check('peek gets live updates', peekState && peekState.teams.length === 3);
  check('peek did not add a player', adminState.players.length === playersBefore + 1);
  c1.sock.close();

  // 3. игра: баззер и счёт по команде
  a1.sock.emit('player:ready', { ready: true });
  a2.sock.emit('player:ready', { ready: true });
  b1.sock.emit('player:ready', { ready: true });
  await sleep(200);
  admin.emit('admin:start');
  await waitFor(() => adminState && adminState.phase !== 'lobby');
  admin.emit('admin:continue');
  await waitFor(() => adminState && adminState.phase === 'playing');
  check('playing', adminState && adminState.phase === 'playing');

  a2.sock.emit('player:buzz');
  await waitFor(() => adminState && adminState.buzzed);
  check('buzz by table name', adminState.buzzed && adminState.buzzed.name === 'Стол 1' && adminState.buzzed.by === 'Боря');
  admin.emit('admin:wrong');
  await waitFor(() => adminState && !adminState.buzzed
    && (adminState.teams.find((t) => t.name === 'Стол 1') || {}).locked === true);
  const t1 = adminState.teams.find((t) => t.name === 'Стол 1');
  const a1st = adminState.players.find((p) => p.id === a1.joined.playerId);
  check('whole table locked', t1 && t1.locked === true && a1st.locked === true);

  b1.sock.emit('player:buzz');
  await waitFor(() => adminState && adminState.buzzed);
  admin.emit('admin:correct');
  await waitFor(() => (adminState.teams.find((t) => t.name === 'Стол 2') || {}).score === 1);
  const t2 = adminState.teams.find((t) => t.name === 'Стол 2');
  check('table 2 scored', t2 && t2.score === 1);

  await api('DELETE', `/music/games/${game._id}`, null, org.token);
  admin.close(); screen.close(); a1.sock.close(); a2.sock.close(); b1.sock.close(); noTeam.sock.close();

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
