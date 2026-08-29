/*
 * Жёсткий realtime-сценарий командной «Угадай мелодии».
 *
 * 16 игроков / 3 команды / 3 блока. Проверяет гонки, которые встречаются
 * на реальной игре: два сокета одного телефона, поздний disconnect старого
 * сокета, мгновенный screen:audio-ready, реконнект проектора, шквал баззеров
 * и быстрый переход с reveal на следующую песню.
 *
 * Запуск:
 *   NODE_PATH=frontend/node_modules node tests/music-team-chaos-test.cjs
 */
const { io } = require('socket.io-client');

const BASE = process.env.MUSIC_TEST_BASE || 'http://127.0.0.1:5000';
const PLAYERS = Number(process.env.PLAYERS || 16);
const TEAM_NAMES = ['Альфа', 'Бета', 'Гамма'];
const SONGS = Number(process.env.SONGS || 6);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let pass = 0;
let fail = 0;
const check = (name, ok, details = '') => {
  if (ok) {
    pass += 1;
    console.log(`PASS: ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL: ${name}${details ? ` | ${details}` : ''}`);
  }
};

const waitFor = async (name, predicate, timeout = 8000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const result = predicate();
      if (result) return result;
    } catch { /* состояние ещё не приехало */ }
    await sleep(20);
  }
  throw new Error(`timeout waiting for ${name}`);
};

async function api(method, path, body, token) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${text}`);
  return data;
}

function connect(label, options = {}) {
  const socket = io(BASE, {
    transports: ['websocket'],
    reconnection: false,
    timeout: 8000,
    ...options,
  });
  socket._label = label;
  socket._state = null;
  socket._errors = [];
  socket.on('state', (state) => { socket._state = state; });
  socket.on('error-msg', (error) => socket._errors.push(error?.message || String(error)));
  return socket;
}

(async () => {
  const sockets = [];
  const activePlayers = new Map();
  let gameId = null;
  let token = null;

  try {
    const login = await api('POST', '/auth/login', {
      username: 'design_org@t.io',
      hashed_pwd: 'password1',
    });
    token = login.token;
    check('организатор вошёл', !!token);

    const created = await api('POST', '/music/games', {
      title: `Team chaos ${Date.now()}`,
      participation: 'team',
      auth: 'open',
    }, token);
    const game = created.game;
    gameId = game._id;
    check('командная игра создана', !!gameId && game.participation === 'team');

    const blockIds = [game.blocks[0]._id];
    for (let block = 1; block < 3; block += 1) {
      const updated = await api('POST', `/music/games/${gameId}/blocks`, {
        name: `Chaos блок ${block + 1}`,
      }, token);
      blockIds.push(updated.game.blocks[block]._id);
    }
    for (let song = 0; song < SONGS; song += 1) {
      const blockIndex = Math.min(2, Math.floor(song / Math.ceil(SONGS / 3)));
      await api('POST', `/music/games/${gameId}/songs`, {
        blockId: blockIds[blockIndex],
        song: {
          title: `Chaos song ${song + 1}`,
          artist: 'Test bot',
          file: `chaos-${song + 1}.mp3`,
          duration: 10,
          startSec: 0,
          endSec: 1,
        },
      }, token);
    }
    check('три блока заполнены песнями', true, `${SONGS} песен`);

    const admin = connect('admin', { auth: { token } });
    const screenA = connect('screen-a');
    const screenB = connect('screen-b');
    let activeScreen = screenB;
    sockets.push(admin, screenA, screenB);
    admin.emit('join', { role: 'admin', gameId });

    // Намеренно без ожидания join: раньше ready обгонял Mongo-запрос join,
    // а его результат затем ошибочно сбрасывал готовность проектора.
    screenA.emit('join', { role: 'screen', gameId });
    screenA.emit('screen:audio-ready');
    screenB.emit('join', { role: 'screen', gameId });
    screenB.emit('screen:audio-ready');
    await waitFor('оба экрана готовы', () => admin._state?.screenReady === true);
    screenA.close();
    await sleep(250);
    check('отключение старого экрана не роняет новый', admin._state?.screenReady === true);

    const ts = Date.now().toString(36);
    const duplicateOldSockets = [];
    for (let index = 0; index < PLAYERS; index += 1) {
      const playerId = `chaos-${ts}-${index}`;
      const teamName = TEAM_NAMES[index % TEAM_NAMES.length];
      const primary = connect(`player-${index}-primary`);
      sockets.push(primary);
      primary.on('joined', (data) => {
        primary._playerId = data.playerId;
        if (index % 3 !== 0) activePlayers.set(data.playerId, primary);
      });
      primary.emit('join', {
        role: 'player', code: game.code, name: `Игрок ${index + 1}`, teamName, playerId,
      });

      // У каждого третьего участника одновременно открывается второй сокет
      // с тем же сохранённым ID — модель быстрого reload/reconnect телефона.
      if (index % 3 === 0) {
        const replacement = connect(`player-${index}-replacement`);
        sockets.push(replacement);
        replacement.on('joined', (data) => {
          replacement._playerId = data.playerId;
          activePlayers.set(data.playerId, replacement);
        });
        replacement.emit('join', {
          role: 'player', code: game.code, name: `Игрок ${index + 1}`, teamName, playerId,
        });
        duplicateOldSockets.push(primary);
      }
    }

    await waitFor('все игроки без дублей', () =>
      admin._state?.players?.length === PLAYERS && activePlayers.size === PLAYERS, 12000);
    check('в лобби ровно 16 уникальных игроков', admin._state.players.length === PLAYERS);
    check('созданы ровно 3 команды', admin._state.teams.length === 3);
    check('онлайн считается по людям, не по сокетам',
      admin._state.teams.reduce((sum, team) => sum + team.online, 0) === PLAYERS);

    for (const oldSocket of duplicateOldSockets) oldSocket.close();
    await sleep(400);
    check('поздние disconnect не выключили замещающие сокеты',
      admin._state.players.every((player) => player.connected));

    for (const socket of activePlayers.values()) socket.emit('player:ready', { ready: true });
    await waitFor('все готовы', () => admin._state?.players?.every((player) => player.ready));
    admin.emit('admin:start');
    await waitFor('интро', () => admin._state?.phase === 'intro');
    admin.emit('admin:continue');
    await waitFor('первая песня', () => admin._state?.phase === 'playing');

    for (let round = 0; round < SONGS; round += 1) {
      await waitFor(`песня ${round + 1}`, () =>
        admin._state?.phase === 'playing' && admin._state.currentIndex === round, 15000);
      const beforeScore = new Map(admin._state.teams.map((team) => [team.id, team.score]));

      // Все 16 телефонов жмут почти одновременно. Сервер обязан выбрать
      // ровно одну команду и перейти в buzzed один раз.
      for (const socket of activePlayers.values()) socket.emit('player:buzz');
      await waitFor(`первый баззер ${round + 1}`, () => admin._state?.phase === 'buzzed');
      const firstTeam = admin._state.buzzed.id;
      check(`раунд ${round + 1}: принят один командный баззер`,
        TEAM_NAMES.includes(admin._state.buzzed.name));

      admin.emit('admin:wrong');
      await waitFor(`возврат после ошибки ${round + 1}`, () => admin._state?.phase === 'playing');
      const lockedTeam = admin._state.teams.find((team) => team.id === firstTeam);
      check(`раунд ${round + 1}: ошибившаяся команда заблокирована`, lockedTeam?.locked === true);

      // Заблокированная команда тоже снова шлёт buzz; победить должна другая.
      for (const socket of activePlayers.values()) socket.emit('player:buzz');
      await waitFor(`второй баззер ${round + 1}`, () => admin._state?.phase === 'buzzed');
      const winningTeam = admin._state.buzzed.id;
      check(`раунд ${round + 1}: заблокированная команда не нажала повторно`, winningTeam !== firstTeam);
      admin.emit('admin:correct');
      await waitFor(`reveal ${round + 1}`, () => admin._state?.phase === 'reveal');
      const scored = admin._state.teams.find((team) => team.id === winningTeam);
      check(`раунд ${round + 1}: начислено ровно одно очко`,
        scored?.score === (beforeScore.get(winningTeam) || 0) + 1);

      // Запоздалый конец аудио во время reveal не должен менять фазу.
      activeScreen.emit('screen:ended');
      await sleep(80);
      check(`раунд ${round + 1}: stale screen:ended проигнорирован`, admin._state.phase === 'reveal');

      // Ведущий быстро переходит дальше, не дожидаясь reveal-таймера.
      admin.emit('admin:skip');
      if (round === SONGS - 1) {
        await waitFor('финал', () => admin._state?.phase === 'finished');
        break;
      }

      const nextStartsBlock = Math.floor((round + 1) / Math.ceil(SONGS / 3))
        !== Math.floor(round / Math.ceil(SONGS / 3));
      if (nextStartsBlock) {
        await waitFor(`итоги блока ${round + 1}`, () => admin._state?.phase === 'standings');
        check(`итоги блока ${round + 1} пришли на телефоны`,
          [...activePlayers.values()].every((socket) => socket._state?.phase === 'standings'));
        admin.emit('admin:continue');
        await waitFor(`анонс блока ${round + 1}`, () => admin._state?.phase === 'blockIntro');
        admin.emit('admin:continue');
      }

      // Посреди игры полностью меняем проектор и снова намеренно шлём ready
      // сразу за join. Состояние готовности не должно мигнуть в false.
      if (round === 2) {
        activeScreen.close();
        await waitFor('экран действительно отключился', () => admin._state?.screenReady === false);
        const screenC = connect('screen-c');
        sockets.push(screenC);
        screenC.emit('join', { role: 'screen', gameId });
        screenC.emit('screen:audio-ready');
        await waitFor('новый экран восстановился', () => admin._state?.screenReady === true);
        activeScreen = screenC;
      }
    }

    check('игра закончилась в границах плейлиста',
      admin._state.phase === 'finished' && admin._state.currentIndex === SONGS - 1);
    check('игроки не задвоились после всех реконнектов', admin._state.players.length === PLAYERS);
    check('сумма очков не больше числа песен',
      admin._state.teams.reduce((sum, team) => sum + team.score, 0) <= SONGS);
    const errors = sockets.flatMap((socket) => socket._errors.map((error) => `${socket._label}: ${error}`));
    check('socket ошибок нет', errors.length === 0, errors.join('; '));
  } finally {
    for (const socket of sockets) {
      try { socket.close(); } catch { /* cleanup */ }
    }
    if (gameId && token) {
      try { await api('DELETE', `/music/games/${gameId}`, null, token); } catch { /* cleanup */ }
    }
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error('ERROR:', error.message);
  process.exit(1);
});
