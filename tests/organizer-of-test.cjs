/*
 * E2E прав organizerOf по типам игр (ROADMAP этап 3).
 * Запуск: node organizer-of-test.cjs (нужен запущенный стек + mongo-контейнер).
 *
 * Сценарий: организатор с organizerOf=['guess_song'] создаёт угадайку,
 * но получает 403 на создание квеста; ['*'] может всё; обычный user — ничего.
 * Роль выдаётся напрямую в Mongo (бутстрап, как в smoke-test).
 */
const { execSync } = require('child_process');

const BASE = process.env.MUSIC_TEST_BASE || 'http://localhost:5000';
const MONGO = process.env.MONGO_CONTAINER || 'quest-mongodb';
const MONGO_ARGS = process.env.MONGO_ARGS || '-u admin -p password --authenticationDatabase admin quest';
let pass = 0, fail = 0;
const check = (n, ok) => { ok ? (pass++, console.log('PASS:', n)) : (fail++, console.log('FAIL:', n)); };

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, data: json };
}

const mongoSet = (nickname, rolesJs, organizerOfJs) => {
  const evalJs = `db.users.updateOne({nickname:'${nickname}'},{$set:{roles:${rolesJs},organizerOf:${organizerOfJs}}})`;
  execSync(`docker exec ${MONGO} mongosh ${MONGO_ARGS} --quiet --eval "${evalJs}"`);
};

async function ensureUser(nick, mail, phone) {
  await api('POST', '/auth/signup', {
    firstName: nick, lastName: 'T', nickname: nick, username: mail,
    city: 'M', phone, hashed_pwd: 'password1',
  });
  const login = await api('POST', '/auth/login', { username: mail, hashed_pwd: 'password1' });
  return login.data;
}

const questBody = (title) => ({
  title, city: 'SPb',
  dateofstart: new Date(Date.now() + 3600000).toISOString(),
  dateofend: new Date(Date.now() + 7200000).toISOString(),
  deposit: '0', prize: '0', description: 'organizerOf test',
});

(async () => {
  const ts = Date.now().toString().slice(-6);

  // 1. Организатор только угадаек
  let music = await ensureUser(`morg${ts}`, `morg${ts}@t.io`, '+70000000040');
  mongoSet(`morg${ts}`, `['user','organizer']`, `['guess_song']`);
  music = (await api('POST', '/auth/login', { username: `morg${ts}@t.io`, hashed_pwd: 'password1' })).data;
  check('music organizer login (organizerOf in user)', Array.isArray(music.user.organizerOf) && music.user.organizerOf.includes('guess_song'));

  const mg = await api('POST', '/music/games', { title: `OrgOf Music ${ts}` }, music.token);
  check('guess_song organizer creates music game', mg.status === 201);
  const mq = await api('POST', '/games', questBody(`OrgOf Quest A ${ts}`), music.token);
  check('guess_song organizer gets 403 on quest', mq.status === 403);

  // 2. Организатор со «всеми» типами
  let all = await ensureUser(`aorg${ts}`, `aorg${ts}@t.io`, '+70000000041');
  mongoSet(`aorg${ts}`, `['user','organizer']`, `['*']`);
  all = (await api('POST', '/auth/login', { username: `aorg${ts}@t.io`, hashed_pwd: 'password1' })).data;

  const ag = await api('POST', '/music/games', { title: `OrgOf Music All ${ts}` }, all.token);
  check('star organizer creates music game', ag.status === 201);
  const aq = await api('POST', '/games', questBody(`OrgOf Quest B ${ts}`), all.token);
  check('star organizer creates quest', aq.status === 201);

  // 3. Легаси-бутстрап: роль organizer с пустым organizerOf — без ограничений
  let legacy = await ensureUser(`lorg${ts}`, `lorg${ts}@t.io`, '+70000000042');
  mongoSet(`lorg${ts}`, `['user','organizer']`, `[]`);
  legacy = (await api('POST', '/auth/login', { username: `lorg${ts}@t.io`, hashed_pwd: 'password1' })).data;
  const lq = await api('POST', '/games', questBody(`OrgOf Quest C ${ts}`), legacy.token);
  check('legacy organizer (empty organizerOf) creates quest', lq.status === 201);

  // 4. Обычный пользователь — ничего
  const plain = await ensureUser(`pusr${ts}`, `pusr${ts}@t.io`, '+70000000043');
  const pg = await api('POST', '/music/games', { title: `OrgOf Music P ${ts}` }, plain.token);
  const pq = await api('POST', '/games', questBody(`OrgOf Quest D ${ts}`), plain.token);
  check('plain user cannot create music', pg.status === 403);
  check('plain user cannot create quest', pq.status === 403);

  // 5. Импорт bundle — те же права, что создание
  const fakeZip = Buffer.from('PK');
  const res = await fetch(BASE + '/music/games/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/zip', Authorization: `Bearer ${plain.token}` },
    body: fakeZip,
  });
  check('plain user cannot import bundle', res.status === 403);

  // чистка созданных игр
  const admin = all; // '*' может модерировать только свои — удаляем каждое своим создателем
  if (mg.status === 201) await api('DELETE', `/music/games/${mg.data.game._id}`, null, music.token);
  if (ag.status === 201) await api('DELETE', `/music/games/${ag.data.game._id}`, null, admin.token);
  if (aq.status === 201) await api('DELETE', `/games/${aq.data.game._id}`, null, admin.token);
  if (lq.status === 201) await api('DELETE', `/games/${lq.data.game._id}`, null, legacy.token);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
