import { Server, Socket } from 'socket.io';
import { Game } from '../models/Game';
import { verifyToken } from '../utils/jwt';
import { isGameModerator } from '../services/gamePermissions';
import { getSession } from '../services/musicSession';
import { newPlayerId } from '../services/musicStore';

// Проверка, что сокет принадлежит модератору игры (для admin-команд).
// Игрок и экран НЕ проверяются — это держит хот-путь баззера тонким.
const verifyAdmin = async (socket: Socket, gameId: string): Promise<boolean> => {
  const token = socket.handshake.auth?.token;
  if (!token) return false;
  try {
    const user = verifyToken(token);
    const game = await Game.findById(gameId);
    return !!game && isGameModerator(game, { id: user.id, roles: user.roles });
  } catch {
    return false;
  }
};

export const registerMusicSockets = (io: Server): void => {
  io.on('connection', (socket: Socket) => {
    let role: 'screen' | 'admin' | 'player' | null = null;
    let gameId: string | null = null;
    let playerId: string | null = null;

    socket.on('join', async (data: any) => {
      role = data.role;
      if (role === 'player') {
        const game = await Game.findOne({ code: (data.code || '').toUpperCase(), kind: 'guess_song' });
        if (!game) { socket.emit('error-msg', { message: 'Игра не найдена по коду.' }); return; }
        gameId = String(game._id);
      } else {
        gameId = data.gameId;
      }

      const game = gameId ? await Game.findById(gameId) : null;
      if (!gameId || !game || game.kind !== 'guess_song') {
        socket.emit('error-msg', { message: 'Игра не найдена.' });
        return;
      }

      // admin-роль требует прав модератора
      if (role === 'admin' && !(await verifyAdmin(socket, gameId))) {
        socket.emit('error-msg', { message: 'Нет прав ведущего.' });
        return;
      }

      const session = getSession(io, gameId);
      socket.join(`g:${gameId}`);
      if (role === 'screen') {
        socket.join(`g:${gameId}:screen`);
        session.setScreenReady(false);
      }
      if (role === 'admin') socket.join(`g:${gameId}:admin`);

      if (role === 'player') {
        playerId = data.playerId || newPlayerId();
        session.upsertPlayer(playerId!, data.name);
        socket.emit('joined', { playerId, gameName: game.title, code: game.code });
      }
      socket.emit('state', await session.publicState());
    });

    socket.on('player:ready', (data: any) => {
      if (role !== 'player' || !gameId || !playerId) return;
      getSession(io, gameId).setReady(playerId, data && data.ready !== false);
    });

    socket.on('player:rename', (data: any) => {
      if (role !== 'player' || !gameId || !playerId) return;
      getSession(io, gameId).upsertPlayer(playerId, data && data.name);
    });

    socket.on('player:buzz', () => {
      if (role !== 'player' || !gameId || !playerId) return;
      getSession(io, gameId).buzz(playerId);
    });

    socket.on('player:offline', () => {
      if (role !== 'player' || !gameId || !playerId) return;
      getSession(io, gameId).setConnected(playerId, false);
    });

    // команды ведущего (только admin-роль, права уже проверены на join)
    const adminActions: Record<string, (s: ReturnType<typeof getSession>) => void> = {
      'admin:start': (s) => { s.start(); },
      'admin:replay': (s) => s.replayCurrent(),
      'admin:correct': (s) => s.correct(),
      'admin:wrong': (s) => s.wrong(),
      'admin:skip': (s) => s.skip(),
      'admin:reset': (s) => s.reset(),
    };
    for (const [evt, fn] of Object.entries(adminActions)) {
      socket.on(evt, () => {
        if (role !== 'admin' || !gameId) return;
        fn(getSession(io, gameId));
      });
    }

    socket.on('screen:ended', () => {
      if (role !== 'screen' || !gameId) return;
      getSession(io, gameId).clipEnded();
    });

    socket.on('screen:audio-ready', () => {
      if (role !== 'screen' || !gameId) return;
      getSession(io, gameId).setScreenReady(true);
    });

    socket.on('disconnect', () => {
      if (role === 'screen' && gameId) {
        getSession(io, gameId).setScreenReady(false);
      }
      if (role === 'player' && gameId && playerId) {
        getSession(io, gameId).setConnected(playerId, false);
      }
    });
  });
};
