import { Server, Socket } from 'socket.io';
import { Game } from '../../../core/models/Game';
import { User } from '../../../core/models/User';
import { Team } from '../../../core/models/Team';
import { verifyToken } from '../../../core/utils/jwt';
import { isGameModerator } from '../../../core/services/gamePermissions';
import { getSession, sessions } from '../services/musicSession';
import { newPlayerId } from '../services/musicStore';

// Проверка, что сокет принадлежит модератору игры (для admin-команд).
// Игрок и экран НЕ проверяются — это держит хот-путь баззера тонким.
// Игра уже загружена в join — переиспользуем, без лишнего запроса в БД.
const verifyAdmin = (socket: Socket, game: any): boolean => {
  const token = socket.handshake.auth?.token;
  if (!token) return false;
  try {
    const user = verifyToken(token);
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
      // Игру грузим ровно один раз: игрок — по коду, экран/ведущий — по gameId.
      let game = null;
      if (role === 'player') {
        game = await Game.findOne({ code: (data.code || '').toUpperCase(), kind: 'guess_song' });
        if (!game) { socket.emit('error-msg', { message: 'Игра не найдена по коду.' }); return; }
        gameId = String(game._id);
      } else {
        gameId = data.gameId;
        game = gameId ? await Game.findById(gameId) : null;
      }

      if (!gameId || !game || game.kind !== 'guess_song') {
        socket.emit('error-msg', { message: 'Игра не найдена.' });
        return;
      }

      // admin-роль требует прав модератора
      if (role === 'admin' && !verifyAdmin(socket, game)) {
        socket.emit('error-msg', { message: 'Нет прав ведущего.' });
        return;
      }

      const session = getSession(io, gameId);
      session.setMeta(game.title, game.code || ''); // кэш меты для publicState
      const isTeam = game.participation === 'team';
      session.setMode(isTeam ? 'team' : 'solo');

      // Два вида командной игры:
      //  team + required — команды Questix (нужен аккаунт, команда из БД);
      //  team + open     — ad-hoc команды вечеринки (аноним вводит название).
      let playerName: string | undefined = data.name;
      let playerTeam: { teamId: string; teamName: string } | undefined;
      if (role === 'player' && game.auth === 'required') {
        const token = socket.handshake.auth?.token;
        let payload: any = null;
        try { payload = token ? verifyToken(token) : null; } catch { payload = null; }
        if (!payload) {
          socket.emit('error-msg', { message: 'Эта игра требует входа в аккаунт.' });
          return;
        }
        const user = await User.findById(payload.id).lean();
        if (!user) {
          socket.emit('error-msg', { message: 'Аккаунт не найден.' });
          return;
        }
        // идентификатор игрока стабильно привязан к аккаунту
        data.playerId = `u:${payload.id}`;
        playerName = user.nickname || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Игрок';

        // Командная с аккаунтами: игрок должен состоять в команде Questix.
        if (isTeam) {
          const team = await Team.findOne({
            $or: [{ captain: payload.id }, { members: payload.id }],
          }).lean();
          if (!team) {
            socket.emit('error-msg', { message: 'Чтобы играть в командном режиме, вступите в команду Questix.' });
            return;
          }
          playerTeam = { teamId: String(team._id), teamName: team.name };
        }
      } else if (role === 'player' && isTeam) {
        // team + open: команда приходит названием с телефона.
        const rawTeam = String(data.teamName || '').replace(/\s+/g, ' ').trim();
        if (!rawTeam) {
          socket.emit('error-msg', { message: 'Укажите название команды.' });
          return;
        }
        if (rawTeam.length > 24) {
          socket.emit('error-msg', { message: 'Название команды до 24 символов.' });
          return;
        }
        // Ключ команды — нормализованное имя: «Стол 1» и «стол 1» — одна команда.
        playerTeam = { teamId: `t:${rawTeam.toLowerCase()}`, teamName: rawTeam };
      }

      socket.join(`g:${gameId}`);
      if (role === 'screen') {
        socket.join(`g:${gameId}:screen`);
        session.setScreenReady(false);
      }
      if (role === 'admin') socket.join(`g:${gameId}:admin`);

      if (role === 'player') {
        playerId = data.playerId || newPlayerId();
        session.upsertPlayer(playerId!, playerName, playerTeam);
        socket.emit('joined', {
          playerId,
          gameName: game.title,
          code: game.code,
          teamId: playerTeam?.teamId || null,
          teamName: playerTeam?.teamName || null,
        });
      }
      socket.emit('state', session.publicState());
    });

    // Предпросмотр лобби до входа: телефон на экране «вход в игру» видит,
    // какие команды уже создали другие, и обновления приходят живьём.
    // Отдаём то же публичное состояние, что и так висит на экране-проекторе.
    socket.on('peek', async (data: any) => {
      const game = await Game.findOne({
        code: String(data?.code || '').toUpperCase(),
        kind: 'guess_song',
      }).lean();
      if (!game) return;
      const id = String(game._id);
      socket.join(`g:${id}`); // подписка на обновления лобби
      // Сессию НЕ создаём: если ведущий ещё не открывал игру, команд и так нет.
      const existing = sessions.get(id);
      if (existing) socket.emit('state', existing.publicState());
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
      'admin:playon': (s) => s.playOn(),
      'admin:correct': (s) => s.correct(),
      'admin:wrong': (s) => s.wrong(),
      'admin:skip': (s) => s.skip(),
      'admin:pause': (s) => s.pause(),
      'admin:resume': (s) => s.resume(),
      'admin:continue': (s) => s.continueNow(),
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
