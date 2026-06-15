/*
 * E2E одиночного квеста против запущенного backend (localhost:5000).
 * Требует организатора design_org@t.io / password1 в БД quest.
 * Создаёт соло-квест, игрок-одиночка подаёт заявку, проходит, проверяем статистику.
 */
const BASE = 'http://localhost:5000';
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
async function ensureUser(first, last, nick, mail) {
  try {
    await api('POST', '/auth/signup', { firstName: first, lastName: last, nickname: nick, username: mail, city: 'M', phone: '+70000000020', hashed_pwd: 'password1' });
  } catch {}
  return api('POST', '/auth/login', { username: mail, hashed_pwd: 'password1' });
}

(async () => {
  const ts = Date.now().toString().slice(-6);
  const org = await api('POST', '/auth/login', { username: 'design_org@t.io', hashed_pwd: 'password1' });
  check('organizer login', !!org.token);

  const player = await ensureUser('Соло', 'Игрок', `solo${ts}`, `solo${ts}@t.io`);
  check('solo player ready', !!player.token);

  // соло-квест, старт через 5 секунд
  const start = new Date(Date.now() + 5000).toISOString();
  const end = new Date(Date.now() + 3600000).toISOString();
  const game = (await api('POST', '/games', {
    title: `Solo Quest ${ts}`, city: 'SPb', dateofstart: start, dateofend: end,
    deposit: '0', prize: '0', description: 'solo', participation: 'solo',
  }, org.token)).game;
  check('create solo quest', game.kind === 'quest' && game.participation === 'solo');
  check('solo quest forced auth required', game.auth === 'required');

  await api('POST', `/tasks/game/${game._id}`, { title: 'T1', description: 'd', answers: ['one'], orderIndex: 0 }, org.token);

  // одиночка подаёт заявку без команды
  const appl = (await api('POST', '/appls', { gameId: game._id }, player.token)).appl;
  check('solo appl created (no team)', !!appl._id && !appl.team);

  // организатор одобряет
  await api('PATCH', `/appls/${appl._id}/status`, { status: 'approved' }, org.token);

  // двигаем старт в прошлое — квест активен
  const { execSync } = require('child_process');
  execSync(`docker exec quest-mongodb mongosh -u admin -p password --authenticationDatabase admin quest --quiet --eval "db.games.updateOne({_id:ObjectId('${game._id}')},{$set:{dateofstart:new Date(Date.now()-60000)}})"`);

  // одиночка начинает игру
  const startRes = await api('POST', '/progress/start', { gameApplId: appl._id }, player.token);
  check('solo start game', !!startRes.progress || !!startRes.message);

  const cur = await api('GET', `/progress/${appl._id}/current-task`, null, player.token);
  check('solo current task', cur.task && cur.task.title === 'T1');

  const ans = await api('POST', `/progress/${appl._id}/submit-answer`, { answer: 'one' }, player.token);
  check('solo correct answer', ans.isCorrect === true);

  const done = await api('GET', `/progress/${appl._id}/current-task`, null, player.token);
  check('solo quest completed', done.status === 'completed');

  // публикация и статистика
  await api('POST', `/games/${game._id}/publish`, null, org.token);
  const stats = await api('GET', `/games/${game._id}/stats`, null, player.token);
  const s0 = stats.statistics[0];
  check('stats: one participant', stats.totalTeams === 1);
  check('stats: solo name = player nick', s0 && s0.teamName === `solo${ts}`);
  check('stats: place 1', s0 && s0.place === 1);

  // чистка
  await api('DELETE', `/games/${game._id}`, null, org.token);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
