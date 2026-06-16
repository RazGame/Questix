import { Server } from 'socket.io';
import { buildPlaylist, PlaylistItem } from './musicStore';

// Тайминги после правильного ответа (мс): доиграть, затем плавно затихнуть.
const REVEAL_PLAY_MS = 5000;
const REVEAL_FADE_MS = 1500;
const NEXT_TRACK_PAUSE_MS = 900;
const BUZZ_FADE_OUT_MS = 320;
const RESUME_FADE_IN_MS = 450;

interface Player {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  score: number; // используется в solo-режиме
  teamId?: string | null; // команда игрока (team-режим)
  teamName?: string | null;
}

type Phase = 'lobby' | 'playing' | 'ended' | 'buzzed' | 'reveal' | 'finished';
type Mode = 'solo' | 'team';

// Стейт-машина одной игры «Угадай мелодию». In-memory: счёт эфемерный,
// в Mongo не персистится — это держит хот-путь баззера быстрым.
class Session {
  io: Server;
  gameId: string;
  gameName = ''; // кэш меты игры — не меняется за сессию, снимаем БД с хот-пути
  code = '';
  mode: Mode = 'solo'; // solo: счёт/баззер по игроку; team: по команде
  players = new Map<string, Player>();
  teamScores = new Map<string, number>(); // teamId -> очки (team-режим)
  phase: Phase = 'lobby';
  playlist: PlaylistItem[] = []; // снимок песен на момент старта
  currentIndex = -1;
  buzzed: { id: string; name: string; by?: string } | null = null; // id = ключ группы (игрок/команда)
  locked = new Set<string>(); // заблокированные в текущем раунде (ключи групп)
  advanceTimer: NodeJS.Timeout | null = null;
  screenReady = false;
  lastActivityAt = Date.now(); // для отгрузки простаивающих сессий

  constructor(io: Server, gameId: string) {
    this.io = io;
    this.gameId = gameId;
  }

  // Мета игры кэшируется при входе (sockets знают game) — без запроса в БД на каждый broadcast.
  setMeta(gameName: string, code: string) {
    this.gameName = gameName;
    this.code = code;
  }

  // Освобождение ресурсов сессии перед удалением из реестра.
  destroy() {
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    this.advanceTimer = null;
  }

  rAll() { return `g:${this.gameId}`; }
  rScreen() { return `g:${this.gameId}:screen`; }
  rAdmin() { return `g:${this.gameId}:admin`; }

  cmd(action: string, payload: Record<string, unknown> = {}) {
    this.io.to(this.rScreen()).emit('cmd', { action, ...payload });
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
  upsertPlayer(playerId: string, name?: string, team?: { teamId: string; teamName: string }) {
    const existing = this.players.get(playerId);
    if (existing) {
      if (name) existing.name = name;
      if (team) { existing.teamId = team.teamId; existing.teamName = team.teamName; }
      existing.connected = true;
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
    this.broadcast();
    return this.players.get(playerId)!;
  }

  setReady(playerId: string, ready: boolean) {
    const p = this.players.get(playerId);
    if (p) { p.ready = ready; this.broadcast(); }
  }

  setConnected(playerId: string, connected: boolean) {
    const p = this.players.get(playerId);
    if (p) { p.connected = connected; this.broadcast(); }
  }

  isArmed(playerId: string) {
    const p = this.players.get(playerId);
    if (!p || !p.ready || this.phase !== 'playing') return false;
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
  setScreenReady(ready: boolean) {
    this.screenReady = ready;
    this.broadcast();
  }

  async start() {
    if (!this.screenReady) {
      this.io.to(this.rAdmin()).emit('error-msg', { message: 'Сначала нажмите «включить звук» на экране проектора.' });
      return false;
    }

    const all = await buildPlaylist(this.gameId);
    const ready = all.filter((s) => s.status === 'ready' && s.file);
    if (ready.length === 0) {
      this.io.to(this.rAdmin()).emit('error-msg', { message: 'Нет ни одной загруженной песни.' });
      return false;
    }
    this.playlist = ready;
    this.currentIndex = 0;
    this.loadCurrent();
    return true;
  }

  loadCurrent() {
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    this.advanceTimer = null;
    this.buzzed = null;
    this.locked.clear();
    this.phase = 'playing';
    const song = this.playlist[this.currentIndex];
    this.cmd('play', {
      fileUrl: `/media/${song.file}`,
      startSec: song.startSec || 0,
      endSec: song.endSec ?? null, // конец отрезка (null = до конца)
      songId: String(song._id),
      // Подсказка экрану для предзагрузки следующего трека.
      nextUrl: this.playlist[this.currentIndex + 1]
        ? `/media/${this.playlist[this.currentIndex + 1].file}`
        : null,
    });
    this.broadcast();
  }

  replayCurrent() {
    const song = this.playlist[this.currentIndex];
    if (!song || !song.file) return;
    if (this.phase !== 'ended' && this.phase !== 'playing') return;

    this.phase = 'playing';
    this.buzzed = null;
    this.cmd('play', {
      fileUrl: `/media/${song.file}`,
      startSec: song.startSec || 0,
      endSec: song.endSec ?? null,
      songId: String(song._id),
      nextUrl: this.playlist[this.currentIndex + 1]
        ? `/media/${this.playlist[this.currentIndex + 1].file}`
        : null,
    });
    this.broadcast();
  }

  clipEnded() {
    if (this.phase !== 'playing') return;
    this.phase = 'ended';
    this.cmd('pause');
    this.broadcast();
  }

  buzz(playerId: string) {
    if (this.phase !== 'playing') return;
    if (!this.isArmed(playerId)) return;
    const p = this.players.get(playerId)!;
    const g = this.groupId(playerId);
    // id = ключ группы; name = команда (team) или игрок (solo); by = кто нажал.
    this.buzzed = {
      id: g,
      name: this.mode === 'team' ? (p.teamName || 'Команда') : p.name,
      by: p.name,
    };
    this.phase = 'buzzed';
    this.cmd('pause', { fadeMs: BUZZ_FADE_OUT_MS });
    this.broadcast();
  }

  correct() {
    if (this.phase !== 'buzzed') return;
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
    this.cmd('fadeAndStop', { playMs: REVEAL_PLAY_MS, fadeMs: REVEAL_FADE_MS });
    this.broadcast();
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    this.advanceTimer = setTimeout(() => this.advance(), REVEAL_PLAY_MS + REVEAL_FADE_MS + 200);
  }

  wrong() {
    if (this.phase !== 'buzzed') return;
    if (this.buzzed) this.locked.add(this.buzzed.id); // выбывает до конца песни
    this.buzzed = null;
    this.phase = 'playing';
    this.cmd('resume', { fadeMs: RESUME_FADE_IN_MS });
    this.broadcast();
  }

  skip() {
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    this.advanceTimer = null;
    this.advance();
  }

  advance() {
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    this.advanceTimer = null;
    this.currentIndex += 1;
    if (this.currentIndex >= this.playlist.length) {
      this.currentIndex = Math.max(0, this.playlist.length - 1);
      this.phase = 'finished';
      this.cmd('stop');
      this.broadcast();
    } else {
      this.cmd('stop');
      this.advanceTimer = setTimeout(() => this.loadCurrent(), NEXT_TRACK_PAUSE_MS);
    }
  }

  reset() {
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    this.advanceTimer = null;
    this.phase = 'lobby';
    this.currentIndex = -1;
    this.buzzed = null;
    this.locked.clear();
    this.teamScores.clear();
    this.playlist = [];
    for (const p of this.players.values()) { p.ready = false; p.score = 0; }
    this.cmd('stop');
    this.broadcast();
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
          armed: this.phase === 'playing' && !this.locked.has(p.teamId),
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
      blockCurrentIndex: blockSongIndex,
      blockTotal: blockSongs.length,
      fileUrl: cur ? `/media/${cur.file}` : null,
      startSec: cur ? (cur.startSec || 0) : 0,
      endSec: cur ? (cur.endSec ?? null) : null,
      nextUrl: cur && this.playlist[safeCurrentIndex + 1]
        ? `/media/${this.playlist[safeCurrentIndex + 1].file}`
        : null,
      screenReady: this.screenReady,
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
    if (!anyConnected && idle && (s.phase === 'lobby' || s.phase === 'finished')) {
      s.destroy();
      sessions.delete(gameId);
    }
  }
}, SWEEP_MS);
// не держим event loop живым ради свипера (важно для тестов/graceful-shutdown)
if (typeof sweeper.unref === 'function') sweeper.unref();

export { sessions, Session };
