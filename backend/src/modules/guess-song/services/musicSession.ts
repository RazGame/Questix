import crypto from 'crypto';
import { Server } from 'socket.io';
import { buildPlaylist, PlaylistItem } from './musicStore';
import { Game } from '../../../core/models/Game';
import { SessionResult } from '../../../core/models/SessionResult';
import { musicLog, MusicLogFields, MusicLogLevel } from './musicLogger';

// Тайминги после правильного ответа (мс): доиграть, затем плавно затихнуть.
const REVEAL_PLAY_MS = 5000;
const REVEAL_FADE_MS = 1500;
const NEXT_TRACK_PAUSE_MS = 900;
const BUZZ_FADE_OUT_MS = 320;
const RESUME_FADE_IN_MS = 450;
// Анонсы блоков: показ всех блоков на старте и заставка перед новым блоком.
const GAME_INTRO_MS = 10000;
const BLOCK_INTRO_MS = 10000;
// Промежуточные итоги перед анонсом нового блока: пауза, чтобы зал успел
// разглядеть, кто впереди.
const STANDINGS_MS = 10000;

interface Player {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  score: number; // используется в solo-режиме
  teamId?: string | null; // команда игрока (team-режим)
  teamName?: string | null;
}

type Phase = 'lobby' | 'intro' | 'standings' | 'blockIntro' | 'playing' | 'ended' | 'buzzed' | 'reveal' | 'finished';
type Mode = 'solo' | 'team';

// Стейт-машина одной игры «Угадай мелодию». In-memory: счёт эфемерный,
// в Mongo не персистится — это держит хот-путь баззера быстрым.
class Session {
  io: Server;
  gameId: string;
  readonly sessionId = crypto.randomBytes(6).toString('hex');
  gameName = ''; // кэш меты игры — не меняется за сессию, снимаем БД с хот-пути
  code = '';
  mode: Mode = 'solo'; // solo: счёт/баззер по игроку; team: по команде
  players = new Map<string, Player>();
  // У одного телефона на короткое время могут жить два сокета: старый ещё
  // закрывается, а новый уже восстановил соединение. Считаем подключения,
  // чтобы поздний disconnect старого сокета не помечал живого игрока офлайн.
  playerConnections = new Map<string, Set<string>>();
  teamScores = new Map<string, number>(); // teamId -> очки (team-режим)
  // Каноничное написание названия команды: ad-hoc команды матчатся ключом
  // без регистра («стол 1» = «Стол 1»), показываем первое введённое.
  teamNames = new Map<string, string>();
  // Сколько секунд даётся на ответ после нажатия. 0 — счётчика нет, ждём
  // ведущего сколько угодно (так игра работала всегда).
  answerSeconds = 0;
  answerEndsAt: number | null = null;
  phase: Phase = 'lobby';
  playlist: PlaylistItem[] = []; // снимок песен на момент старта
  currentIndex = -1;
  buzzed: { id: string; name: string; by?: string; answer?: string } | null = null; // id = ключ группы (игрок/команда)
  locked = new Set<string>(); // заблокированные в текущем раунде (ключи групп)
  advanceTimer: NodeJS.Timeout | null = null;
  // Отложенный переход (анонс блока/reveal/следующий трек) — храним колбэк и
  // дедлайн, чтобы пауза могла заморозить таймер и продолжить с остатка.
  pendingAction: (() => void) | null = null;
  pendingDeadline = 0;
  pendingRemaining: number | null = null; // остаток таймера на момент паузы
  paused = false;
  blockNames: string[] = []; // имена блоков в порядке плейлиста (для интро)
  freePlay = false; // «доигрываем дальше»: отрезок закончился, играем без ограничения
  revealGuessed = true; // reveal после верного ответа (false — ведущий показал сам)
  screenReady = false;
  private readyScreenConnections = new Set<string>();
  // Оформление проектора выбирает ведущий из пульта. Хранится в сессии, а не
  // в самом экране: тогда тема переживает перезагрузку окна проектора и не
  // требует, чтобы кто-то шёл к ноутбуку у экрана.
  screenTheme: 'classic' | 'cyberpunk' | 'party' | 'synthwave' = 'classic';
  lastActivityAt = Date.now(); // для отгрузки простаивающих сессий

  constructor(io: Server, gameId: string) {
    this.io = io;
    this.gameId = gameId;
    this.logEvent('session_created');
  }

  logEvent(event: string, fields: MusicLogFields = {}, level: MusicLogLevel = 'info') {
    const song = this.playlist[this.currentIndex];
    musicLog(level, event, {
      gameId: this.gameId,
      sessionId: this.sessionId,
      phase: this.phase,
      songIndex: this.currentIndex,
      songId: song?._id ? String(song._id) : null,
      players: this.players.size,
      connectedPlayers: Array.from(this.players.values()).filter((player) => player.connected).length,
      ...fields,
    });
  }

  // Мета игры кэшируется при входе (sockets знают game) — без запроса в БД на каждый broadcast.
  setMeta(gameName: string, code: string) {
    this.gameName = gameName;
    this.code = code;
  }

  // Освобождение ресурсов сессии перед удалением из реестра.
  destroy() {
    this.logEvent('session_destroyed');
    this.clearSchedule();
    this.playerConnections.clear();
    this.readyScreenConnections.clear();
  }

  // Единая точка отложенных переходов: помнит колбэк и дедлайн ради паузы.
  schedule(fn: () => void, ms: number) {
    this.clearSchedule();
    this.pendingAction = fn;
    this.pendingDeadline = Date.now() + ms;
    this.advanceTimer = setTimeout(() => {
      this.advanceTimer = null;
      this.pendingAction = null;
      fn();
    }, ms);
  }

  clearSchedule() {
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    this.advanceTimer = null;
    this.pendingAction = null;
  }

  rAll() { return `g:${this.gameId}`; }
  rScreen() { return `g:${this.gameId}:screen`; }
  rAdmin() { return `g:${this.gameId}:admin`; }

  cmd(action: string, payload: Record<string, unknown> = {}) {
    this.logEvent('screen_command', { action, payload }, 'debug');
    this.io.to(this.rScreen()).emit('cmd', { action, ...payload });
  }

  setAnswerSeconds(sec?: number) {
    const v = Math.round(Number(sec) || 0);
    this.answerSeconds = Number.isFinite(v) && v > 0 ? Math.min(v, 120) : 0;
  }

  setMode(mode: Mode) {
    if (this.mode !== mode) this.mode = mode;
  }

  // Ключ группировки баззера/блокировки/счёта: команда (team) или сам игрок (solo).
  groupId(playerId: string): string {
    const p = this.players.get(playerId);
    if (this.mode === 'team') return p?.teamId || playerId;
    return playerId;
  }

  // --- игроки ---
  upsertPlayer(
    playerId: string,
    name?: string,
    team?: { teamId: string; teamName: string },
    connectionId?: string,
  ) {
    if (connectionId) {
      const connections = this.playerConnections.get(playerId) || new Set<string>();
      connections.add(connectionId);
      this.playerConnections.set(playerId, connections);
    }
    if (team) {
      // Первое написание закрепляется за командой, дальше все видят его.
      const canonical = this.teamNames.get(team.teamId);
      if (canonical) team = { ...team, teamName: canonical };
      else this.teamNames.set(team.teamId, team.teamName);
    }
    const existing = this.players.get(playerId);
    const wasConnected = existing?.connected === true;
    if (existing) {
      if (name) existing.name = name;
      // Сменить команду можно только в лобби: посреди игры реджойн с другим
      // названием не должен уносить очки/блокировки в другую группу.
      if (team && (this.phase === 'lobby' || !existing.teamId)) {
        existing.teamId = team.teamId;
        existing.teamName = team.teamName;
      }
      // rename без connectionId не меняет сетевое состояние; join — меняет.
      if (connectionId) existing.connected = true;
    } else {
      this.players.set(playerId, {
        id: playerId,
        name: name || 'Игрок',
        ready: false,
        connected: true,
        score: 0,
        teamId: team?.teamId ?? null,
        teamName: team?.teamName ?? null,
      });
    }
    const player = this.players.get(playerId)!;
    this.logEvent(existing ? 'player_rejoined' : 'player_joined', {
      playerId,
      playerName: player.name,
      teamId: player.teamId,
      teamName: player.teamName,
      connectionId,
      connections: this.playerConnections.get(playerId)?.size || 0,
      wasConnected,
    });
    this.broadcast();
    return player;
  }

  setReady(playerId: string, ready: boolean) {
    const p = this.players.get(playerId);
    if (p) {
      p.ready = ready;
      this.logEvent('player_ready_changed', { playerId, ready, teamId: p.teamId });
      this.broadcast();
    }
  }

  setConnected(playerId: string, connected: boolean) {
    const p = this.players.get(playerId);
    if (p) { p.connected = connected; this.broadcast(); }
  }

  disconnectPlayer(playerId: string, connectionId: string) {
    const connections = this.playerConnections.get(playerId);
    if (connections) {
      connections.delete(connectionId);
      if (connections.size === 0) this.playerConnections.delete(playerId);
    }
    const p = this.players.get(playerId);
    if (!p) return;
    p.connected = (this.playerConnections.get(playerId)?.size || 0) > 0;
    this.logEvent('player_connection_closed', {
      playerId,
      teamId: p.teamId,
      connectionId,
      stillConnected: p.connected,
      remainingConnections: this.playerConnections.get(playerId)?.size || 0,
    });
    this.broadcast();
  }

  isArmed(playerId: string) {
    const p = this.players.get(playerId);
    if (!p || this.phase !== 'playing' || this.paused) return false;
    if (this.mode === 'team' && !p.teamId) return false; // без команды баззер недоступен
    return !this.locked.has(this.groupId(playerId));
  }

  // Очки игрока для показа: в team-режиме это очки его команды.
  scoreFor(playerId: string): number {
    const p = this.players.get(playerId);
    if (!p) return 0;
    if (this.mode === 'team') return p.teamId ? (this.teamScores.get(p.teamId) || 0) : 0;
    return p.score;
  }

  // --- управление игрой ---
  setScreenReady(ready: boolean, connectionId?: string) {
    if (connectionId) {
      if (ready) this.readyScreenConnections.add(connectionId);
      else this.readyScreenConnections.delete(connectionId);
      this.screenReady = this.readyScreenConnections.size > 0;
    } else {
      this.screenReady = ready;
    }
    this.logEvent('screen_ready_changed', {
      ready,
      connectionId,
      effectiveReady: this.screenReady,
      readyScreens: this.readyScreenConnections.size,
    });
    this.broadcast();
  }

  setScreenTheme(theme: string) {
    const allowed = ['classic', 'cyberpunk', 'party', 'synthwave'] as const;
    if (!(allowed as readonly string[]).includes(theme)) return;
    this.screenTheme = theme as typeof this.screenTheme;
    this.logEvent('screen_theme_changed', { theme });
    this.broadcast();
  }

  async start() {
    if (!this.screenReady) {
      this.logEvent('game_start_rejected', { reason: 'screen_not_ready' }, 'warn');
      this.io.to(this.rAdmin()).emit('error-msg', { message: 'Сначала нажмите «включить звук» на экране проектора.' });
      return false;
    }

    // Настройки игры перечитываем на старте: ведущий правит их в редакторе
    // при уже открытой сессии, а значение бралось только при входе в комнату.
    const meta = await Game.findById(this.gameId).lean();
    this.setAnswerSeconds((meta as any)?.answerSeconds);

    const all = await buildPlaylist(this.gameId);
    const ready = all.filter((s) => s.status === 'ready' && s.file);
    if (ready.length === 0) {
      this.logEvent('game_start_rejected', { reason: 'playlist_empty', totalSongs: all.length }, 'warn');
      this.io.to(this.rAdmin()).emit('error-msg', { message: 'Нет ни одной загруженной песни.' });
      return false;
    }
    this.dropDisconnected(); // чистим лобби от ушедших и их пустых команд
    this.playlist = ready;
    // Уникальные имена блоков в порядке следования — для интро-заставки.
    this.blockNames = Array.from(new Set(ready.map((s) => s.blockName)));
    this.currentIndex = 0;
    this.paused = false;
    this.pendingRemaining = null;
    // Сначала интро со списком всех блоков, затем первая песня.
    this.phase = 'intro';
    this.buzzed = null;
    this.locked.clear();
    this.logEvent('game_started', {
      mode: this.mode,
      songs: ready.length,
      blocks: this.blockNames.length,
      answerSeconds: this.answerSeconds,
      screenReady: this.screenReady,
    });
    this.broadcast();
    this.schedule(() => this.loadCurrent(), GAME_INTRO_MS);
    return true;
  }

  loadCurrent() {
    this.clearSchedule();
    this.freePlay = false;
    this.buzzed = null;
    this.locked.clear();
    this.phase = 'playing';
    const song = this.playlist[this.currentIndex];
    this.logEvent('song_started', {
      title: song.title,
      artist: song.artist,
      blockName: song.blockName,
      startSec: song.startSec || 0,
      endSec: song.endSec ?? null,
      reverse: !!song.reverseMode,
      blitz: !!song.blitzMode,
      coverHint: !!song.coverHint,
    });
    this.cmd('play', {
      fileUrl: `/media/${song.file}`,
      startSec: song.startSec || 0,
      endSec: song.endSec ?? null, // конец отрезка (null = до конца)
      songId: String(song._id),
      // Обложка уходит ТОЛЬКО экрану (комната screen) и заранее: иначе он
      // начинает качать её в момент раскрытия, и картинка появляется с
      // заметным опозданием. В общем состоянии её до раскрытия нет —
      // телефоны игроков ответ не увидят.
      cover: song.cover || '',
      reverse: !!song.reverseMode, // отрезок играется задом наперёд
      // Подсказка экрану для предзагрузки следующего трека.
      nextUrl: this.playlist[this.currentIndex + 1]
        ? `/media/${this.playlist[this.currentIndex + 1].file}`
        : null,
    });
    this.broadcast();
  }

  replayCurrent() {
    if (this.paused) {
      this.logEvent('song_replay_rejected', { reason: 'paused' }, 'debug');
      return;
    }
    const song = this.playlist[this.currentIndex];
    if (!song || !song.file) {
      this.logEvent('song_replay_rejected', { reason: 'song_missing' }, 'warn');
      return;
    }
    if (this.phase !== 'ended' && this.phase !== 'playing') {
      this.logEvent('song_replay_rejected', { reason: 'invalid_phase' }, 'debug');
      return;
    }

    this.freePlay = false;
    this.phase = 'playing';
    this.buzzed = null;
    this.logEvent('song_replayed');
    this.cmd('play', {
      fileUrl: `/media/${song.file}`,
      startSec: song.startSec || 0,
      endSec: song.endSec ?? null,
      songId: String(song._id),
      cover: song.cover || '', // предзагрузка обложки, только для экрана
      reverse: !!song.reverseMode,
      nextUrl: this.playlist[this.currentIndex + 1]
        ? `/media/${this.playlist[this.currentIndex + 1].file}`
        : null,
    });
    this.broadcast();
  }

  clipEnded() {
    if (this.phase !== 'playing') {
      this.logEvent('clip_end_ignored', { reason: 'invalid_phase' }, 'debug');
      return;
    }
    this.phase = 'ended';
    this.logEvent('clip_ended');
    this.cmd('pause');
    this.broadcast();
  }

  // Никто не угадал фрагмент: продолжаем песню с места остановки,
  // без ограничения отрезка (до конца файла или до баззера).
  playOn() {
    if (this.paused) {
      this.logEvent('play_on_rejected', { reason: 'paused' }, 'debug');
      return;
    }
    if (this.phase !== 'ended') {
      this.logEvent('play_on_rejected', { reason: 'invalid_phase' }, 'debug');
      return;
    }
    const song = this.playlist[this.currentIndex];
    if (!song || !song.file) return;
    this.freePlay = true;
    this.phase = 'playing';
    this.buzzed = null;
    this.logEvent('play_on_started', { reverse: !!song.reverseMode });
    this.cmd('playOn', { fadeMs: RESUME_FADE_IN_MS });
    this.broadcast();
  }

  buzz(playerId: string, answer?: string) {
    if (this.phase !== 'playing') {
      this.logEvent('buzz_rejected', { playerId, reason: 'invalid_phase' }, 'debug');
      return;
    }
    if (!this.isArmed(playerId)) {
      this.logEvent('buzz_rejected', {
        playerId,
        reason: this.paused ? 'paused' : this.locked.has(this.groupId(playerId)) ? 'locked' : 'not_armed',
        groupId: this.groupId(playerId),
      }, 'debug');
      return;
    }
    const p = this.players.get(playerId)!;
    const g = this.groupId(playerId);
    // В блице игрок жмёт не «баззер», а конкретный вариант — ведущему важно
    // видеть, что именно выбрали, иначе четыре кнопки это просто баззер.
    const song = this.playlist[this.currentIndex];
    const picked = answer && song?.blitzMode && (song.options || []).includes(answer)
      ? answer
      : undefined;
    // id = ключ группы; name = команда (team) или игрок (solo); by = кто нажал.
    this.buzzed = {
      id: g,
      name: this.mode === 'team' ? (p.teamName || 'Команда') : p.name,
      by: p.name,
      answer: picked,
    };
    this.phase = 'buzzed';
    this.cmd('pause', { fadeMs: BUZZ_FADE_OUT_MS });
    // Счётчик ответа. Не успели — засчитываем как неверный ответ: иначе
    // команда, которая нажала наугад, держит раунд сколько захочет.
    if (this.answerSeconds > 0) {
      this.answerEndsAt = Date.now() + this.answerSeconds * 1000;
      this.schedule(() => this.answerTimeout(), this.answerSeconds * 1000);
    } else {
      this.answerEndsAt = null;
    }
    this.logEvent('buzz_accepted', {
      playerId,
      playerName: p.name,
      groupId: g,
      teamId: p.teamId,
      teamName: p.teamName,
      blitzAnswer: picked,
      answerDeadline: this.answerEndsAt ? new Date(this.answerEndsAt).toISOString() : null,
    });
    this.broadcast();
  }

  /** Время вышло — то же самое, что неверный ответ, но без участия ведущего. */
  private answerTimeout() {
    if (this.phase !== 'buzzed') return;
    this.logEvent('answer_timed_out', { groupId: this.buzzed?.id });
    this.wrong();
  }

  correct() {
    if (this.phase !== 'buzzed') {
      this.logEvent('correct_rejected', { reason: 'invalid_phase' }, 'debug');
      return;
    }
    const winner = this.buzzed ? { ...this.buzzed } : null;
    this.answerEndsAt = null;
    this.revealGuessed = true;
    if (this.buzzed) {
      if (this.mode === 'team') {
        const g = this.buzzed.id;
        this.teamScores.set(g, (this.teamScores.get(g) || 0) + 1);
      } else {
        const p = this.players.get(this.buzzed.id);
        if (p) p.score += 1;
      }
    }
    this.phase = 'reveal';
    this.logEvent('answer_marked_correct', {
      groupId: winner?.id,
      groupName: winner?.name,
      answeredBy: winner?.by,
      answer: winner?.answer,
    });
    this.cmd('fadeAndStop', { playMs: REVEAL_PLAY_MS, fadeMs: REVEAL_FADE_MS });
    this.broadcast();
    this.schedule(() => this.advance(), REVEAL_PLAY_MS + REVEAL_FADE_MS + 200);
  }

  wrong() {
    if (this.phase !== 'buzzed') {
      this.logEvent('wrong_rejected', { reason: 'invalid_phase' }, 'debug');
      return;
    }
    const rejected = this.buzzed ? { ...this.buzzed } : null;
    this.clearSchedule(); // снимаем счётчик ответа, если он ещё тикал
    this.answerEndsAt = null;
    if (this.buzzed) this.locked.add(this.buzzed.id); // выбывает до конца песни
    this.buzzed = null;
    this.phase = 'playing';
    // Ошиблись все — снимаем блокировки и даём ещё круг. Иначе песня доигрывает
    // в тишине: нажать некому, а ведущему остаётся только пропустить.
    const resetLocks = !this.anyArmed();
    if (resetLocks) this.locked.clear();
    this.logEvent('answer_marked_wrong', {
      groupId: rejected?.id,
      groupName: rejected?.name,
      answeredBy: rejected?.by,
      resetLocks,
      lockedGroups: Array.from(this.locked),
    });
    this.cmd('resume', { fadeMs: RESUME_FADE_IN_MS });
    this.broadcast();
  }

  // --- ведение списка участников ---
  // Отцепить игрока (ушёл, дубль, случайный зашедший).
  kickPlayer(playerId: string) {
    if (!this.players.delete(playerId)) return;
    this.playerConnections.delete(playerId);
    this.logEvent('player_kicked', { playerId });
    this.broadcast();
  }

  // Убрать команду целиком вместе с её игроками.
  removeTeam(teamId: string) {
    let changed = false;
    let removedPlayers = 0;
    for (const [id, p] of this.players) {
      if (p.teamId === teamId) {
        this.players.delete(id);
        this.playerConnections.delete(id);
        changed = true;
        removedPlayers += 1;
      }
    }
    this.teamScores.delete(teamId);
    this.teamNames.delete(teamId);
    this.locked.delete(teamId);
    if (changed) {
      this.logEvent('team_removed', { teamId, removedPlayers });
      this.broadcast();
    }
  }

  // Перед стартом выкидываем тех, кто уже отвалился: иначе в списке висят
  // пустые команды от людей, закрывших вкладку на этапе сбора.
  dropDisconnected() {
    let changed = false;
    let removedPlayers = 0;
    for (const [id, p] of this.players) {
      if (!p.connected) {
        this.players.delete(id);
        this.playerConnections.delete(id);
        changed = true;
        removedPlayers += 1;
      }
    }
    if (removedPlayers > 0) this.logEvent('offline_players_dropped', { removedPlayers });
    return changed;
  }

  // Никто не угадал: показать правильный ответ и перейти к следующей песне.
  // Очки не начисляются; отличается от correct() только этим и флагом,
  // чтобы игроки не видели «Правильно!», когда никто не ответил.
  revealAnswer() {
    if (!['playing', 'ended', 'buzzed'].includes(this.phase) || this.paused) {
      this.logEvent('answer_reveal_rejected', {
        reason: this.paused ? 'paused' : 'invalid_phase',
      }, 'debug');
      return;
    }
    this.buzzed = null;
    this.revealGuessed = false;
    this.phase = 'reveal';
    this.logEvent('answer_revealed_without_score');
    this.cmd('fadeAndStop', { playMs: REVEAL_PLAY_MS, fadeMs: REVEAL_FADE_MS });
    this.broadcast();
    this.schedule(() => this.advance(), REVEAL_PLAY_MS + REVEAL_FADE_MS + 200);
  }

  // Может ли хоть кто-то ещё нажать баззер в текущем раунде.
  // Если нет — ведущему бессмысленно ждать, пульт предлагает показать ответ.
  anyArmed(): boolean {
    for (const p of this.players.values()) {
      if (p.connected && this.isArmed(p.id)) return true;
    }
    return false;
  }

  skip() {
    if (this.paused) {
      this.logEvent('skip_rejected', { reason: 'paused' }, 'debug');
      return;
    }
    this.logEvent('skip_requested');
    // Во время заставки «пропустить» = запустить песню, а не потерять её.
    if (this.phase === 'intro' || this.phase === 'blockIntro') {
      this.continueNow();
      return;
    }
    this.clearSchedule();
    this.advance();
  }

  // Анонс нового блока — после промежуточных итогов.
  showBlockIntro() {
    this.clearSchedule();
    this.phase = 'blockIntro';
    this.logEvent('block_intro_started', { blockName: this.playlist[this.currentIndex]?.blockName });
    this.broadcast();
    this.schedule(() => this.loadCurrent(), BLOCK_INTRO_MS);
  }

  // Завершить игру досрочно: итоги подводятся так же, как если бы доиграли
  // весь плейлист — со снапшотом в базу и таблицей на экране.
  finishNow() {
    if (this.phase === 'lobby' || this.phase === 'finished') {
      this.logEvent('finish_rejected', { reason: 'invalid_phase' }, 'debug');
      return;
    }
    this.clearSchedule();
    this.paused = false;
    this.buzzed = null;
    this.locked.clear();
    this.phase = 'finished';
    this.logEvent('game_finished_early', { scores: this.scoreSnapshot() });
    this.cmd('stop');
    this.broadcast();
    this.saveResultSnapshot();
  }

  advance() {
    this.clearSchedule();
    const prev = this.playlist[this.currentIndex];
    const previousIndex = this.currentIndex;
    this.currentIndex += 1;
    if (this.currentIndex >= this.playlist.length) {
      this.currentIndex = Math.max(0, this.playlist.length - 1);
      this.phase = 'finished';
      this.logEvent('game_finished', {
        previousSongIndex: previousIndex,
        scores: this.scoreSnapshot(),
      });
      this.cmd('stop');
      this.broadcast();
      // Снапшот итогов в Mongo (ROADMAP этап 5) — вне хот-пути, fire-and-forget.
      this.saveResultSnapshot();
    } else {
      this.cmd('stop');
      const next = this.playlist[this.currentIndex];
      if (prev && next.blockName !== prev.blockName) {
        // Смена блока — это естественный перерыв: сперва показываем, кто как
        // идёт, и только потом анонсируем следующий блок.
        this.phase = 'standings';
        this.buzzed = null;
        this.locked.clear();
        this.logEvent('standings_started', {
          previousBlock: prev.blockName,
          nextBlock: next.blockName,
          scores: this.scoreSnapshot(),
        });
        this.broadcast();
        this.schedule(() => this.showBlockIntro(), STANDINGS_MS);
      } else {
        this.logEvent('song_advance_scheduled', {
          previousSongIndex: previousIndex,
          nextSongIndex: this.currentIndex,
          delayMs: NEXT_TRACK_PAUSE_MS,
        }, 'debug');
        this.schedule(() => this.loadCurrent(), NEXT_TRACK_PAUSE_MS);
      }
    }
  }

  // Пауза ведущего: замораживает баззеры, звук и отложенные переходы.
  pause() {
    if (this.paused) {
      this.logEvent('pause_rejected', { reason: 'already_paused' }, 'debug');
      return;
    }
    // Пауза доступна в любой игровой фазе, включая 'buzzed' и 'reveal':
    // ведущему бывает нужно остановиться прямо посреди ответа, а прыгающая
    // кнопка в пульте только мешала. В лобби и финале паузить нечего.
    if (['lobby', 'finished'].includes(this.phase)) {
      this.logEvent('pause_rejected', { reason: 'invalid_phase' }, 'debug');
      return;
    }
    this.paused = true;
    if (this.advanceTimer) {
      clearTimeout(this.advanceTimer);
      this.advanceTimer = null;
      this.pendingRemaining = Math.max(0, this.pendingDeadline - Date.now());
    } else {
      this.pendingRemaining = null;
    }
    if (this.phase === 'playing') this.cmd('pause', { fadeMs: BUZZ_FADE_OUT_MS });
    this.logEvent('game_paused', { pendingRemainingMs: this.pendingRemaining });
    this.broadcast();
  }

  resume() {
    if (!this.paused) {
      this.logEvent('resume_rejected', { reason: 'not_paused' }, 'debug');
      return;
    }
    this.paused = false;
    const fn = this.pendingAction;
    if (fn && this.pendingRemaining != null) this.schedule(fn, this.pendingRemaining);
    this.pendingRemaining = null;
    if (this.phase === 'playing') this.cmd('resume', { fadeMs: RESUME_FADE_IN_MS });
    this.logEvent('game_resumed');
    this.broadcast();
  }

  // Ведущий пропускает ожидание интро-заставки и сразу запускает песню.
  continueNow() {
    if (this.paused) {
      this.logEvent('continue_rejected', { reason: 'paused' }, 'debug');
      return;
    }
    this.logEvent('continue_requested');
    // С экрана итогов «продолжить» ведёт к анонсу блока, а не сразу к песне.
    if (this.phase === 'standings') { this.showBlockIntro(); return; }
    if (this.phase !== 'intro' && this.phase !== 'blockIntro') return;
    const fn = this.pendingAction;
    this.clearSchedule();
    if (fn) fn();
    else this.loadCurrent();
  }

  reset() {
    this.clearSchedule();
    this.phase = 'lobby';
    this.currentIndex = -1;
    this.buzzed = null;
    this.paused = false;
    this.pendingRemaining = null;
    this.freePlay = false;
    this.locked.clear();
    this.teamScores.clear();
    this.playlist = [];
    this.blockNames = [];
    for (const p of this.players.values()) { p.ready = false; p.score = 0; }
    this.logEvent('game_reset');
    this.cmd('stop');
    this.broadcast();
  }

  // Снапшот итогов вечеринки в Mongo (ROADMAP этап 5). Счёт в сессии
  // эфемерный — это единственное место, где он персистится. Отправкой в
  // облако занимается core (/results/send), здесь только фиксация.
  saveResultSnapshot() {
    if (this.players.size === 0) {
      this.logEvent('result_snapshot_skipped', { reason: 'no_players' }, 'debug');
      return;
    }

    const toUserId = (playerId: string) =>
      playerId.startsWith('u:') ? playerId.slice(2) : null;

    let standings: Array<{
      name: string; teamName: string | null; userId: string | null; score: number; place: number;
    }> = [];

    if (this.mode === 'team') {
      // Место — командное (teamSummary уже отсортирован по очкам),
      // строки — по игрокам, чтобы вечеринка находилась в профиле каждого.
      const teamPlace = new Map<string, { place: number; score: number }>();
      this.teamSummary().forEach((t, i) => teamPlace.set(t.id, { place: i + 1, score: t.score }));
      standings = Array.from(this.players.values())
        .filter((p) => p.teamId && teamPlace.has(p.teamId))
        .map((p) => ({
          name: p.name,
          teamName: p.teamName || 'Команда',
          userId: toUserId(p.id),
          score: teamPlace.get(p.teamId!)!.score,
          place: teamPlace.get(p.teamId!)!.place,
        }));
    } else {
      standings = Array.from(this.players.values())
        .sort((a, b) => b.score - a.score)
        .map((p, i) => ({
          name: p.name,
          teamName: null,
          userId: toUserId(p.id),
          score: p.score,
          place: i + 1,
        }));
    }

    const resultId = crypto.randomUUID();
    SessionResult.create({
      resultId,
      gameId: this.gameId,
      kind: 'guess_song',
      title: this.gameName,
      mode: this.mode,
      finishedAt: new Date(),
      standings,
    })
      .then(() => this.logEvent('result_snapshot_saved', { resultId, rows: standings.length }))
      .catch((error) => {
        this.logEvent('result_snapshot_failed', { resultId, error }, 'error');
      });
  }

  private scoreSnapshot() {
    return this.mode === 'team'
      ? this.teamSummary().map((team) => ({ id: team.id, name: team.name, score: team.score }))
      : Array.from(this.players.values())
          .map((player) => ({ id: player.id, name: player.name, score: player.score }))
          .sort((a, b) => b.score - a.score);
  }

  // Сводка по командам (team-режим): очки + кто в сети/готов.
  teamSummary() {
    const map = new Map<string, { id: string; name: string; score: number; online: number; ready: number; armed: boolean; locked: boolean }>();
    for (const p of this.players.values()) {
      if (!p.teamId) continue;
      let t = map.get(p.teamId);
      if (!t) {
        t = {
          id: p.teamId,
          name: p.teamName || 'Команда',
          score: this.teamScores.get(p.teamId) || 0,
          online: 0,
          ready: 0,
          armed: this.phase === 'playing' && !this.paused && !this.locked.has(p.teamId),
          locked: this.locked.has(p.teamId),
        };
        map.set(p.teamId, t);
      }
      if (p.connected) t.online += 1;
      if (p.ready) t.ready += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.score - a.score);
  }

  // --- состояние для клиентов ---
  publicState() {
    const safeCurrentIndex =
      this.playlist.length > 0
        ? Math.min(Math.max(this.currentIndex, 0), this.playlist.length - 1)
        : -1;
    const cur = safeCurrentIndex >= 0 ? this.playlist[safeCurrentIndex] : null;
    const blockSongs = cur ? this.playlist.filter((song) => song.blockName === cur.blockName) : [];
    const blockSongIndex = cur
      ? blockSongs.findIndex((song) => String(song._id) === String(cur._id))
      : -1;
    const showReveal = this.phase === 'reveal';
    return {
      gameId: this.gameId,
      gameName: this.gameName,
      code: this.code,
      phase: this.phase,
      total: this.playlist.length,
      currentIndex: safeCurrentIndex,
      buzzed: this.buzzed,
      reveal: cur && showReveal
        ? { title: cur.title, artist: cur.artist, album: cur.album, cover: cur.cover }
        : null,
      blockName: cur ? cur.blockName : '',
      currentSongId: cur ? String(cur._id) : null,
      blockCurrentIndex: blockSongIndex,
      blockTotal: blockSongs.length,
      blocks: this.blockNames,
      paused: this.paused,
      // Остаток интро-таймера (мс) — для обратного отсчёта на экране.
      introMs:
        this.phase === 'intro' || this.phase === 'blockIntro' || this.phase === 'standings'
          ? (this.paused
              ? this.pendingRemaining
              : this.advanceTimer
                ? Math.max(0, this.pendingDeadline - Date.now())
                : null)
          : null,
      // Счётчик ответа. Пока идёт — отдаём момент истечения, чтобы телефон и
      // экран считали сами и не зависели от частоты рассылок. На паузе
      // момента нет, есть застывший остаток.
      answerTotalMs: this.answerSeconds > 0 ? this.answerSeconds * 1000 : null,
      answerEndsAt: this.phase === 'buzzed' && !this.paused ? this.answerEndsAt : null,
      answerLeftMs:
        this.phase === 'buzzed' && this.answerSeconds > 0
          ? (this.paused
              ? this.pendingRemaining
              : Math.max(0, (this.answerEndsAt || 0) - Date.now()))
          : null,
      fileUrl: cur ? `/media/${cur.file}` : null,
      startSec: cur ? (cur.startSec || 0) : 0,
      // В режиме «доигрываем дальше» отрезок не ограничен (для ресинка экрана).
      endSec: cur ? (this.freePlay ? null : (cur.endSec ?? null)) : null,
      // Режимы приходят с блока; варианты блица берём у самой песни.
      blitzMode: cur ? !!cur.blitzMode : false,
      options: cur && cur.blitzMode ? (cur.options || []) : [],
      reverseMode: cur ? !!cur.reverseMode : false,
      coverHint: cur ? !!cur.coverHint : false,
      nextUrl: cur && this.playlist[safeCurrentIndex + 1]
        ? `/media/${this.playlist[safeCurrentIndex + 1].file}`
        : null,
      screenReady: this.screenReady,
      screenTheme: this.screenTheme,
      revealGuessed: this.revealGuessed,
      // Есть ли ещё кому нажимать баззер (в 'playing' пульт по этому флагу
      // предлагает показать ответ вместо бесконечного ожидания).
      anyArmed: this.anyArmed(),
      mode: this.mode,
      teams: this.mode === 'team' ? this.teamSummary() : [],
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        ready: p.ready,
        connected: p.connected,
        score: this.scoreFor(p.id),
        teamId: p.teamId ?? null,
        teamName: p.teamName ?? null,
        armed: this.isArmed(p.id),
        locked: this.locked.has(this.groupId(p.id)),
      })),
    };
  }

  broadcast() {
    this.lastActivityAt = Date.now();
    this.io.to(this.rAll()).emit('state', this.publicState());
  }
}

// Менеджер сессий
const sessions = new Map<string, Session>();

export const getSession = (io: Server, gameId: string): Session => {
  if (!sessions.has(gameId)) sessions.set(gameId, new Session(io, gameId));
  return sessions.get(gameId)!;
};

// Снять сессию из реестра (при удалении игры) — освобождает таймеры/память.
export const dropSession = (gameId: string): void => {
  const s = sessions.get(gameId);
  if (!s) return;
  s.destroy();
  sessions.delete(gameId);
};

// Периодическая отгрузка простаивающих сессий: нет подключённых игроков,
// фаза lobby/finished и тишина дольше IDLE_MS. Иначе Map растёт вечно.
const IDLE_MS = 30 * 60 * 1000;
const SWEEP_MS = 5 * 60 * 1000;
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [gameId, s] of sessions) {
    const anyConnected = Array.from(s.players.values()).some((p) => p.connected);
    const idle = now - s.lastActivityAt > IDLE_MS;
    // Фазу не смотрим: сессия, брошенная посреди игры (ведущий закрыл
    // вкладку), раньше не подпадала под уборку и висела в памяти вечно.
    // Полчаса без единого подключения — вечеринка точно закончилась.
    if (!anyConnected && idle) {
      s.destroy();
      sessions.delete(gameId);
    }
  }
}, SWEEP_MS);
// не держим event loop живым ради свипера (важно для тестов/graceful-shutdown)
if (typeof sweeper.unref === 'function') sweeper.unref();

export { sessions, Session };
