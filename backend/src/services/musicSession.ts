import { Server } from 'socket.io';
import { Game } from '../models/Game';
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
  score: number;
}

type Phase = 'lobby' | 'playing' | 'ended' | 'buzzed' | 'reveal' | 'finished';

// Стейт-машина одной игры «Угадай мелодию». In-memory: счёт эфемерный,
// в Mongo не персистится — это держит хот-путь баззера быстрым.
class Session {
  io: Server;
  gameId: string;
  players = new Map<string, Player>();
  phase: Phase = 'lobby';
  playlist: PlaylistItem[] = []; // снимок песен на момент старта
  currentIndex = -1;
  buzzed: { id: string; name: string } | null = null;
  locked = new Set<string>(); // заблокированные в текущем раунде
  advanceTimer: NodeJS.Timeout | null = null;
  screenReady = false;

  constructor(io: Server, gameId: string) {
    this.io = io;
    this.gameId = gameId;
  }

  rAll() { return `g:${this.gameId}`; }
  rScreen() { return `g:${this.gameId}:screen`; }
  rAdmin() { return `g:${this.gameId}:admin`; }

  cmd(action: string, payload: Record<string, unknown> = {}) {
    this.io.to(this.rScreen()).emit('cmd', { action, ...payload });
  }

  // --- игроки ---
  upsertPlayer(playerId: string, name?: string) {
    const existing = this.players.get(playerId);
    if (existing) {
      if (name) existing.name = name;
      existing.connected = true;
    } else {
      this.players.set(playerId, {
        id: playerId,
        name: name || 'Игрок',
        ready: false,
        connected: true,
        score: 0,
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
    return !!(p && p.ready && this.phase === 'playing' && !this.locked.has(playerId));
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
    this.buzzed = { id: p.id, name: p.name };
    this.phase = 'buzzed';
    this.cmd('pause', { fadeMs: BUZZ_FADE_OUT_MS });
    this.broadcast();
  }

  correct() {
    if (this.phase !== 'buzzed') return;
    const p = this.buzzed && this.players.get(this.buzzed.id);
    if (p) p.score += 1;
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
    this.playlist = [];
    for (const p of this.players.values()) { p.ready = false; p.score = 0; }
    this.cmd('stop');
    this.broadcast();
  }

  // --- состояние для клиентов ---
  async publicState() {
    const game = await Game.findById(this.gameId).lean();
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
      gameName: game ? game.title : '',
      code: game ? game.code : '',
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
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        ready: p.ready,
        connected: p.connected,
        score: p.score,
        armed: this.isArmed(p.id),
        locked: this.locked.has(p.id),
      })),
    };
  }

  async broadcast() {
    const state = await this.publicState();
    this.io.to(this.rAll()).emit('state', state);
  }
}

// Менеджер сессий
const sessions = new Map<string, Session>();

export const getSession = (io: Server, gameId: string): Session => {
  if (!sessions.has(gameId)) sessions.set(gameId, new Session(io, gameId));
  return sessions.get(gameId)!;
};

export { sessions, Session };
