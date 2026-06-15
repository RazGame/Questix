/*
 * Небольшой нагрузочный сценарий realtime «Угадай мелодию».
 *
 * Запуск из корня проекта:
 *   $env:NODE_PATH='C:\Projects\quest-modern\frontend\node_modules'; node .\music-load-test.cjs
 *
 * Настройки:
 *   BASE=http://localhost:5000 PLAYERS=30 SONGS=8 BURST=10 node music-load-test.cjs
 *
 * Нужен seed-пользователь: design_org@t.io / password1.
 */
const { io } = require('socket.io-client');

const BASE = process.env.BASE || 'http://localhost:5000';
const PLAYERS = Number(process.env.PLAYERS || 30);
const SONGS = Number(process.env.SONGS || 8);
const BURST = Number(process.env.BURST || Math.min(12, PLAYERS));
const CONNECT_TIMEOUT_MS = 8000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (maxMs) => Math.floor(Math.random() * maxMs);

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, details = '') {
  if (ok) {
    pass += 1;
    console.log(`PASS: ${name}`);
    return true;
  }
  fail += 1;
  const message = details ? `${name} | ${details}` : name;
  failures.push(message);
  console.log(`FAIL: ${message}`);
  return false;
}

async function waitFor(name, predicate, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const value = predicate();
      if (value) return value;
    } catch {
      // Predicate can touch state that has not arrived yet.
    }
    await sleep(25);
  }
  throw new Error(`timeout waiting for ${name}`);
}

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return json;
}

function connectSocket(label, opts = {}) {
  const socket = io(BASE, {
    transports: ['websocket'],
    timeout: CONNECT_TIMEOUT_MS,
    reconnection: false,
    ...opts,
  });
  socket._label = label;
  socket._states = [];
  socket._errors = [];
  socket.on('state', (state) => {
    socket._state = state;
    socket._states.push(state);
  });
  socket.on('error-msg', (error) => {
    socket._errors.push(error?.message || String(error));
  });
  return socket;
}

function closeAll(sockets) {
  for (const socket of sockets) {
    try {
      socket.close();
    } catch {
      // Nothing useful to do during cleanup.
    }
  }
}

function connectedPlayerStates(state) {
  return (state?.players || []).filter((player) => player.connected);
}

function assertCoreState(name, state, expectedPlayers) {
  const validPhase = ['lobby', 'playing', 'ended', 'buzzed', 'reveal', 'finished'].includes(state?.phase);
  const indexOk =
    state?.total > 0
      ? state.currentIndex >= 0 && state.currentIndex < state.total
      : state?.currentIndex === -1;
  const playersOk = state?.players?.length === expectedPlayers;
  const scoresOk = (state?.players || []).every((player) => Number.isInteger(player.score) && player.score >= 0);
  return check(
    name,
    validPhase && indexOk && playersOk && scoresOk,
    `phase=${state?.phase}, index=${state?.currentIndex}/${state?.total}, players=${state?.players?.length}`
  );
}

function sameRealtimeCore(a, b) {
  return (
    a &&
    b &&
    a.phase === b.phase &&
    a.currentIndex === b.currentIndex &&
    String(a.buzzed?.id || '') === String(b.buzzed?.id || '')
  );
}

function pickBuzzers(players, lockedIds = new Set()) {
  const available = players.filter((player) => player.ready && player.connected && !lockedIds.has(player.id));
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(BURST, shuffled.length));
}

async function emitBuzzBurst(playerSockets, state, lockedIds = new Set()) {
  const buzzers = pickBuzzers(state.players || [], lockedIds);
  for (const player of buzzers) {
    const socket = playerSockets.get(player.id);
    if (socket) setTimeout(() => socket.emit('player:buzz'), jitter(25));
  }
  return buzzers;
}

(async () => {
  console.log(`Load test target: ${BASE}`);
  console.log(`Scenario: ${PLAYERS} players, ${SONGS} songs, burst=${BURST}`);

  let gameId = null;
  let token = null;
  const sockets = [];
  const playerSockets = new Map();

  try {
    const login = await api('POST', '/auth/login', {
      username: 'design_org@t.io',
      hashed_pwd: 'password1',
    });
    token = login.token;
    check('organizer login', !!token);

    const title = `Load Test ${Date.now()}`;
    const created = await api('POST', '/music/games', { title }, token);
    const game = created.game;
    gameId = game._id;
    check('create music game', !!gameId && !!game.code);

    const firstBlockId = game.blocks[0]._id;
    const secondBlockResponse = await api('POST', `/music/games/${gameId}/blocks`, { name: 'Load Block 2' }, token);
    const secondBlockId = secondBlockResponse.game.blocks.find((block) => block.name === 'Load Block 2')._id;

    for (let i = 0; i < SONGS; i += 1) {
      const blockId = i < Math.ceil(SONGS / 2) ? firstBlockId : secondBlockId;
      await api(
        'POST',
        `/music/games/${gameId}/songs`,
        {
          blockId,
          song: {
            title: `Load Song ${i + 1}`,
            artist: 'Load Bot',
            duration: 10,
            startSec: 0,
            endSec: 1,
            file: `load-song-${i + 1}.mp3`,
          },
        },
        token
      );
    }
    check('seed ready songs', true, `${SONGS} songs`);

    const admin = connectSocket('admin', { auth: { token } });
    const screen = connectSocket('screen');
    sockets.push(admin, screen);

    admin.emit('join', { role: 'admin', gameId });
    screen.emit('join', { role: 'screen', gameId });
    screen.emit('screen:audio-ready');

    await waitFor('screen readiness', () => admin._state?.screenReady === true);
    check('screen is ready before start', admin._state.screenReady === true);

    for (let i = 0; i < PLAYERS; i += 1) {
      const player = connectSocket(`player-${i + 1}`);
      sockets.push(player);
      player.on('joined', (data) => {
        player._playerId = data.playerId;
        playerSockets.set(data.playerId, player);
      });
      player.emit('join', { role: 'player', code: game.code, name: `P${String(i + 1).padStart(2, '0')}` });
      await waitFor(`player ${i + 1} joined`, () => player._playerId, 3000);
    }

    await waitFor('all players connected', () => admin._state?.players?.length === PLAYERS, 6000);
    check('all players visible to host', admin._state.players.length === PLAYERS);

    for (const socket of sockets.filter((socket) => socket._label?.startsWith('player-'))) {
      socket.emit('player:ready', { ready: true });
    }
    await waitFor('all players ready', () => admin._state?.players?.every((player) => player.ready), 6000);
    check('all players ready', admin._state.players.every((player) => player.ready));

    admin.emit('admin:start');
    await waitFor('game playing', () => admin._state?.phase === 'playing', 5000);
    check('game starts playing', admin._state.phase === 'playing');
    assertCoreState('state invariant after start', admin._state, PLAYERS);

    const disconnectedVictim = admin._state.players[Math.floor(PLAYERS / 3)];
    const victimSocket = playerSockets.get(disconnectedVictim.id);
    victimSocket.close();
    await waitFor('player marked offline', () => {
      const player = admin._state?.players?.find((item) => item.id === disconnectedVictim.id);
      return player && player.connected === false;
    }, 5000);
    check('disconnect marks player offline', true, disconnectedVictim.name);

    const reconnected = connectSocket('player-reconnect');
    sockets.push(reconnected);
    reconnected.on('joined', (data) => {
      reconnected._playerId = data.playerId;
      playerSockets.set(data.playerId, reconnected);
    });
    reconnected.emit('join', {
      role: 'player',
      code: game.code,
      name: disconnectedVictim.name,
      playerId: disconnectedVictim.id,
    });
    await waitFor('player marked online again', () => {
      const player = admin._state?.players?.find((item) => item.id === disconnectedVictim.id);
      return player && player.connected === true;
    }, 5000);
    check('reconnect restores same player', true, disconnectedVictim.name);

    for (let round = 0; round < SONGS; round += 1) {
      await waitFor(`round ${round + 1} playing`, () => admin._state?.phase === 'playing' || admin._state?.phase === 'finished', 5000);
      if (admin._state.phase === 'finished') break;

      assertCoreState(`round ${round + 1} invariant before buzz`, admin._state, PLAYERS);

      if (round === 0) {
        screen.emit('screen:ended');
        await waitFor('first clip ended state', () => admin._state?.phase === 'ended', 3000);
        check('screen ended switches to host wait', admin._state.phase === 'ended');
        await emitBuzzBurst(playerSockets, admin._state);
        await sleep(250);
        check('buzz ignored after clip ended', admin._state.phase === 'ended');
        admin.emit('admin:replay');
        await waitFor('replay returns to playing', () => admin._state?.phase === 'playing', 3000);
        check('replay returns phase to playing', admin._state.phase === 'playing');
      }

      const scoreBefore = new Map(admin._state.players.map((player) => [player.id, player.score]));
      const wrongFirst = round % 2 === 0 && connectedPlayerStates(admin._state).length > 1;
      const lockedIds = new Set();

      await emitBuzzBurst(playerSockets, admin._state, lockedIds);
      await waitFor(`round ${round + 1} first buzz`, () => admin._state?.phase === 'buzzed' && admin._state.buzzed, 3000);
      const firstBuzzed = admin._state.buzzed;
      check(`round ${round + 1} accepts one first buzz`, !!firstBuzzed);

      if (wrongFirst) {
        admin.emit('admin:wrong');
        lockedIds.add(firstBuzzed.id);
        await waitFor(`round ${round + 1} resumes after wrong`, () => admin._state?.phase === 'playing', 3000);
        const lockedPlayer = admin._state.players.find((player) => player.id === firstBuzzed.id);
        check(`round ${round + 1} wrong locks player`, lockedPlayer?.locked === true);

        const lockedScore = admin._state.players.find((player) => player.id === firstBuzzed.id)?.score;
        check(`round ${round + 1} wrong does not change score`, lockedScore === scoreBefore.get(firstBuzzed.id));

        await emitBuzzBurst(playerSockets, admin._state, lockedIds);
        await waitFor(`round ${round + 1} second buzz`, () => admin._state?.phase === 'buzzed' && admin._state.buzzed, 3000);
        check(`round ${round + 1} locked player cannot rebuzz`, admin._state.buzzed.id !== firstBuzzed.id);
      }

      const correctBuzzed = admin._state.buzzed;
      admin.emit('admin:correct');
      await waitFor(`round ${round + 1} reveal`, () => admin._state?.phase === 'reveal', 3000);
      const winner = admin._state.players.find((player) => player.id === correctBuzzed.id);
      check(
        `round ${round + 1} correct increments exactly one score`,
        winner?.score === (scoreBefore.get(correctBuzzed.id) || 0) + 1
      );

      const screenAligned = sameRealtimeCore(admin._state, screen._state);
      check(`round ${round + 1} screen state aligned`, screenAligned);

      admin.emit('admin:skip');
      await waitFor(`round ${round + 1} advances`, () => {
        return admin._state?.phase === 'playing' || admin._state?.phase === 'finished';
      }, 3500);
    }

    await waitFor('game finished', () => admin._state?.phase === 'finished', 5000);
    check('game finishes within playlist bounds', admin._state.phase === 'finished');
    assertCoreState('final state invariant', admin._state, PLAYERS);

    const totalScore = admin._state.players.reduce((sum, player) => sum + player.score, 0);
    check('total score does not exceed song count', totalScore <= SONGS, `score=${totalScore}, songs=${SONGS}`);

    const socketErrors = sockets.flatMap((socket) => socket._errors.map((error) => `${socket._label}: ${error}`));
    check('no socket error messages', socketErrors.length === 0, socketErrors.join('; '));
  } finally {
    closeAll(sockets);
    if (gameId && token) {
      try {
        await api('DELETE', `/music/games/${gameId}`, null, token);
      } catch (error) {
        console.log(`WARN: cleanup failed: ${error.message}`);
      }
    }
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log('\nFailures:');
    for (const item of failures) console.log(`- ${item}`);
  }
  process.exit(fail === 0 ? 0 : 1);
})().catch((error) => {
  console.error('ERROR:', error.message);
  process.exit(1);
});
