import { Server, Socket } from 'socket.io';
import { Game } from '../../../core/models/Game';
import { User } from '../../../core/models/User';
import { Team } from '../../../core/models/Team';
import { verifyToken } from '../../../core/utils/jwt';
import { isGameModerator } from '../../../core/services/gamePermissions';
import { getSession, sessions } from '../services/musicSession';
import { newPlayerId } from '../services/musicStore';
import { musicLog } from '../services/musicLogger';

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

// Что можно отправить в зал. Список закрытый: свободный текст улетал бы на
// проектор как есть, а это корпоратив.
const ALLOWED_REACTIONS = new Set(['❤️', '🔥', '🎉', '🎵', '👏', '💩']);
const REACTION_INTERVAL_MS = 1000;
const ALLOWED_SCREEN_LOG_EVENTS = new Set([
  'audio_unlocked',
  'playback_started',
  'reverse_started',
  'playback_failed',
  'reverse_failed_fallback',
  'reverse_recovery_failed',
]);

export const registerMusicSockets = (io: Server): void => {
  io.on('connection', (socket: Socket) => {
    let role: 'screen' | 'admin' | 'player' | null = null;
    let gameId: string | null = null;
    let playerId: string | null = null;

    musicLog('debug', 'socket_connected', {
      connectionId: socket.id,
      address: socket.handshake.address,
    });

    socket.on('join', (data: any) => {
      void (async () => {
      role = data.role;
      musicLog('debug', 'join_requested', {
        connectionId: socket.id,
        role,
        requestedGameId: data.gameId,
        code: typeof data.code === 'string' ? data.code.slice(0, 8) : undefined,
        hasPlayerId: !!data.playerId,
      });
      // Игру грузим ровно один раз: игрок — по коду, экран/ведущий — по gameId.
      let game = null;
      if (role === 'player') {
        game = await Game.findOne({ code: (data.code || '').toUpperCase(), kind: 'guess_song' });
        if (!game) {
          musicLog('warn', 'join_rejected', { connectionId: socket.id, role, reason: 'code_not_found' });
          socket.emit('error-msg', { message: 'Игра не найдена по коду.' });
          return;
        }
        gameId = String(game._id);
      } else {
        gameId = data.gameId;
        game = gameId ? await Game.findById(gameId) : null;
      }

      if (!gameId || !game || game.kind !== 'guess_song') {
        musicLog('warn', 'join_rejected', { connectionId: socket.id, role, gameId, reason: 'game_not_found' });
        socket.emit('error-msg', { message: 'Игра не найдена.' });
        return;
      }

      // admin-роль требует прав модератора
      if (role === 'admin' && !verifyAdmin(socket, game)) {
        musicLog('warn', 'join_rejected', { connectionId: socket.id, role, gameId, reason: 'admin_forbidden' });
        socket.emit('error-msg', { message: 'Нет прав ведущего.' });
        return;
      }

      const session = getSession(io, gameId);
      session.setMeta(game.title, game.code || ''); // кэш меты для publicState
      session.setAnswerSeconds((game as any).answerSeconds); // время на ответ, 0 — без счётчика
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
          session.logEvent('join_rejected', { connectionId: socket.id, role, reason: 'auth_required' }, 'warn');
          socket.emit('error-msg', { message: 'Эта игра требует входа в аккаунт.' });
          return;
        }
        const user = await User.findById(payload.id).lean();
        if (!user) {
          session.logEvent('join_rejected', { connectionId: socket.id, role, reason: 'user_not_found' }, 'warn');
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
            session.logEvent('join_rejected', { connectionId: socket.id, role, reason: 'team_required' }, 'warn');
            socket.emit('error-msg', { message: 'Чтобы играть в командном режиме, вступите в команду Questix.' });
            return;
          }
          playerTeam = { teamId: String(team._id), teamName: team.name };
        }
      } else if (role === 'player' && isTeam) {
        // team + open: команда приходит названием с телефона.
        const rawTeam = String(data.teamName || '').replace(/\s+/g, ' ').trim();
        if (!rawTeam) {
          session.logEvent('join_rejected', { connectionId: socket.id, role, reason: 'team_name_empty' }, 'warn');
          socket.emit('error-msg', { message: 'Укажите название команды.' });
          return;
        }
        if (rawTeam.length > 24) {
          session.logEvent('join_rejected', { connectionId: socket.id, role, reason: 'team_name_too_long' }, 'warn');
          socket.emit('error-msg', { message: 'Название команды до 24 символов.' });
          return;
        }
        // Ключ команды — нормализованное имя: «Стол 1» и «стол 1» — одна команда.
        playerTeam = { teamId: `t:${rawTeam.toLowerCase()}`, teamName: rawTeam };
      }

      // join содержит запросы к Mongo. Если вкладка/старый сокет успели
      // закрыться за время await, не создаём из уже мёртвого подключения
      // «призрачного» игрока, которого disconnect больше не сможет убрать.
      if (!socket.connected) {
        session.logEvent('join_abandoned', { connectionId: socket.id, role, reason: 'socket_disconnected' }, 'debug');
        return;
      }

      socket.join(`g:${gameId}`);
      if (role === 'screen') {
        socket.join(`g:${gameId}:screen`);
      }
      if (role === 'admin') socket.join(`g:${gameId}:admin`);

      if (role === 'player') {
        playerId = data.playerId || newPlayerId();
        session.upsertPlayer(playerId!, playerName, playerTeam, socket.id);
        socket.emit('joined', {
          playerId,
          gameName: game.title,
          code: game.code,
          teamId: playerTeam?.teamId || null,
          teamName: playerTeam?.teamName || null,
        });
      }
      session.logEvent('socket_joined_game', {
        connectionId: socket.id,
        role,
        playerId,
      });
      socket.emit('state', session.publicState());
      })().catch((error) => {
        musicLog('error', 'join_failed', {
          connectionId: socket.id,
          role,
          gameId,
          playerId,
          error,
        });
        socket.emit('error-msg', { message: 'Не удалось подключиться к игре.' });
      });
    });

    // Предпросмотр лобби до входа: телефон на экране «вход в игру» видит,
    // какие команды уже создали другие, и обновления приходят живьём.
    // Отдаём то же публичное состояние, что и так висит на экране-проекторе.
    socket.on('peek', (data: any) => {
      void (async () => {
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
      })().catch((error) => {
        musicLog('error', 'lobby_peek_failed', {
          connectionId: socket.id,
          code: typeof data?.code === 'string' ? data.code.slice(0, 8) : undefined,
          error,
        });
      });
    });

    socket.on('player:ready', (data: any) => {
      if (role !== 'player' || !gameId || !playerId) return;
      getSession(io, gameId).setReady(playerId, data && data.ready !== false);
    });

    socket.on('player:rename', (data: any) => {
      if (role !== 'player' || !gameId || !playerId) return;
      getSession(io, gameId).upsertPlayer(playerId, data && data.name);
    });

    socket.on('player:buzz', (data?: any) => {
      if (role !== 'player' || !gameId || !playerId) return;
      // В блице телефон присылает выбранный вариант; сервер сверяет его со
      // списком песни и игнорирует произвольный текст.
      const answer = typeof data?.answer === 'string' ? data.answer.slice(0, 80) : undefined;
      getSession(io, gameId).buzz(playerId, answer);
    });

    socket.on('player:offline', () => {
      if (role !== 'player' || !gameId || !playerId) return;
      getSession(io, gameId).disconnectPlayer(playerId, socket.id);
    });

    // Реакции летят на проектор перед всем залом, поэтому: только игроки,
    // только заранее оговорённые эмодзи и не чаще раза в секунду.
    // Иначе достаточно одного шутника, чтобы написать на экране что угодно
    // или залить зал сотней картинок.
    let lastReactionAt = 0;
    socket.on('player:reaction', (data: any) => {
      if (role !== 'player' || !gameId || !playerId) return;
      const emoji = String(data?.emoji || '');
      if (!ALLOWED_REACTIONS.has(emoji)) return;
      const now = Date.now();
      if (now - lastReactionAt < REACTION_INTERVAL_MS) return;
      lastReactionAt = now;

      const session = sessions.get(gameId);
      if (!session) return;
      io.to(`g:${gameId}`).emit('reaction:fly', {
        id: `${now}-${Math.random().toString(36).slice(2, 6)}`,
        emoji,
        senderName: session.players.get(playerId)?.name || 'Игрок',
      });
    });

    // команды ведущего (только admin-роль, права уже проверены на join)
    const adminActions: Record<string, (s: ReturnType<typeof getSession>) => unknown> = {
      'admin:start': (s) => s.start(),
      'admin:replay': (s) => s.replayCurrent(),
      'admin:playon': (s) => s.playOn(),
      'admin:correct': (s) => s.correct(),
      'admin:reveal': (s) => s.revealAnswer(),
      'admin:wrong': (s) => s.wrong(),
      'admin:skip': (s) => s.skip(),
      'admin:pause': (s) => s.pause(),
      'admin:resume': (s) => s.resume(),
      'admin:continue': (s) => s.continueNow(),
      'admin:reset': (s) => s.reset(),
      'admin:finish': (s) => s.finishNow(), // завершить досрочно с подведением итогов
    };
    for (const [evt, fn] of Object.entries(adminActions)) {
      socket.on(evt, () => {
        if (role !== 'admin' || !gameId) return;
        const session = getSession(io, gameId);
        const action = evt.slice('admin:'.length);
        session.logEvent('admin_action', { action, connectionId: socket.id });
        try {
          const result = fn(session);
          if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
            void Promise.resolve(result).catch((error) => {
              session.logEvent('admin_action_failed', { action, connectionId: socket.id, error }, 'error');
              socket.emit('error-msg', { message: 'Команда ведущего завершилась с ошибкой.' });
            });
          }
        } catch (error) {
          session.logEvent('admin_action_failed', { action, connectionId: socket.id, error }, 'error');
          socket.emit('error-msg', { message: 'Команда ведущего завершилась с ошибкой.' });
        }
      });
    }

    // Действия с параметром — отдельно от таблицы выше, она без аргументов.
    socket.on('admin:kick', (data: any) => {
      if (role !== 'admin' || !gameId || !data?.playerId) return;
      getSession(io, gameId).kickPlayer(String(data.playerId));
    });
    socket.on('admin:theme', (data: any) => {
      if (role !== 'admin' || !gameId || typeof data?.theme !== 'string') return;
      getSession(io, gameId).setScreenTheme(data.theme);
    });
    socket.on('admin:remove-team', (data: any) => {
      if (role !== 'admin' || !gameId || !data?.teamId) return;
      getSession(io, gameId).removeTeam(String(data.teamId));
    });

    socket.on('screen:ended', () => {
      if (role !== 'screen' || !gameId) return;
      getSession(io, gameId).clipEnded();
    });

    socket.on('screen:audio-ready', () => {
      if (role !== 'screen' || !gameId) return;
      getSession(io, gameId).setScreenReady(true, socket.id);
    });

    // Ошибки Web Audio происходят в браузере проектора и иначе остаются
    // только в DevTools. Принимаем закрытый список диагностических событий,
    // ограничиваем поля и пишем их в тот же журнал сессии.
    socket.on('screen:log', (data: any) => {
      if (role !== 'screen' || !gameId) return;
      const event = typeof data?.event === 'string' ? data.event : '';
      if (!ALLOWED_SCREEN_LOG_EVENTS.has(event)) return;
      const details = data?.details && typeof data.details === 'object'
        ? Object.fromEntries(Object.entries(data.details).slice(0, 20))
        : {};
      getSession(io, gameId).logEvent(`screen_${event}`, {
        connectionId: socket.id,
        details,
      }, event.includes('failed') ? 'warn' : 'info');
    });

    socket.on('disconnect', (reason) => {
      // Берём только существующую сессию: getSession её создаёт, и поздний
      // обрыв связи воскрешал бы сессию, только что убранную свипером.
      const session = gameId ? sessions.get(gameId) : null;
      if (!session) {
        musicLog('debug', 'socket_disconnected', {
          connectionId: socket.id,
          role,
          gameId,
          playerId,
          reason,
        });
        return;
      }
      session.logEvent('socket_disconnected', {
        connectionId: socket.id,
        role,
        playerId,
        reason,
      });
      if (role === 'screen') session.setScreenReady(false, socket.id);
      if (role === 'player' && playerId) session.disconnectPlayer(playerId, socket.id);
    });
  });
};
