import api, { API_URL } from './api';
import { MusicGame, Song } from '../types';

export interface MusicGameFull {
  game: MusicGame;
  songs: Song[];
}

export interface SongSearchResult {
  title: string;
  artist: string;
  album?: string;
  cover?: string;
  duration?: number;
  sourceUrl?: string;
  preview?: string;
}

export interface PlaylistImportResult {
  ok: boolean;
  playlist?: {
    name?: string;
    owner?: string;
    cover_url?: string;
    track_count?: number;
  };
  imported: number;
  skipped: number;
}

export const musicCoverSrc = (cover?: string): string => {
  if (!cover) return '';
  if (cover.startsWith('/')) return `${API_URL}${cover}`;
  if (!/^https?:\/\//i.test(cover)) return cover;
  return `${API_URL}/music/cover?url=${encodeURIComponent(cover)}`;
};

export const musicService = {
  // --- игры ---
  list: async (): Promise<(MusicGame & { songCount: number })[]> => {
    const res = await api.get('/music/games');
    return res.data;
  },
  create: async (
    title?: string,
    auth?: 'open' | 'required',
    participation?: 'solo' | 'team'
  ): Promise<MusicGame> => {
    const res = await api.post('/music/games', { title, auth, participation });
    return res.data.game;
  },
  get: async (id: string): Promise<MusicGameFull> => {
    const res = await api.get(`/music/games/${id}`);
    return res.data;
  },
  update: async (
    id: string,
    patch: {
      title?: string;
      auth?: 'open' | 'required';
      participation?: 'solo' | 'team';
      blockOrder?: string[]; // перестановка id всех блоков игры
    }
  ): Promise<MusicGame> => {
    const res = await api.patch(`/music/games/${id}`, patch);
    return res.data.game;
  },
  // Публичная мета по коду (без токена) — для страницы игрока.
  publicMeta: async (code: string): Promise<{ title: string; auth: 'open' | 'required'; participation: 'solo' | 'team' }> => {
    const res = await api.get(`/music/public/${code}`);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/music/games/${id}`);
  },

  // --- блоки ---
  addBlock: async (id: string, name?: string): Promise<MusicGame> => {
    const res = await api.post(`/music/games/${id}/blocks`, { name });
    return res.data.game;
  },
  updateBlock: async (
    id: string,
    blockId: string,
    patch: { name?: string; songIds?: string[] } // songIds — перестановка песен блока
  ): Promise<MusicGame> => {
    const res = await api.patch(`/music/games/${id}/blocks/${blockId}`, patch);
    return res.data.game;
  },
  removeBlock: async (id: string, blockId: string): Promise<MusicGame> => {
    const res = await api.delete(`/music/games/${id}/blocks/${blockId}`);
    return res.data.game;
  },

  // --- песни ---
  addSong: async (id: string, blockId: string, song: Partial<Song> | SongSearchResult): Promise<Song> => {
    const res = await api.post(`/music/games/${id}/songs`, { blockId, song });
    return res.data.song;
  },
  updateSong: async (id: string, songId: string, patch: Partial<Song>): Promise<Song> => {
    const res = await api.patch(`/music/games/${id}/songs/${songId}`, patch);
    return res.data.song;
  },
  removeSong: async (id: string, songId: string): Promise<void> => {
    await api.delete(`/music/games/${id}/songs/${songId}`);
  },
  uploadSongFile: async (id: string, songId: string, file: File): Promise<Song> => {
    const ext = file.name.split('.').pop() || 'mp3';
    const res = await api.post(
      `/music/games/${id}/songs/${songId}/upload?ext=${encodeURIComponent(ext)}`,
      file,
      { headers: { 'Content-Type': 'application/octet-stream' } }
    );
    return res.data.song;
  },
  importPlaylist: async (id: string, blockId: string, url: string): Promise<PlaylistImportResult> => {
    const res = await api.post(`/music/games/${id}/playlist-import`, { blockId, url });
    return res.data;
  },

  // --- поиск (SpotiFLAC, фаза D) ---
  search: async (q: string): Promise<SongSearchResult[]> => {
    const res = await api.get('/music/search', { params: { q } });
    return res.data.results;
  },
  downloadSong: async (id: string, songId: string): Promise<void> => {
    await api.post(`/music/games/${id}/songs/${songId}/download`);
  },

  // --- сеть / QR ---
  net: async (): Promise<{ ip: string; base: string }> => {
    const res = await api.get('/music/net');
    return res.data;
  },
  qr: async (text: string): Promise<string> => {
    const res = await api.get('/music/qr', { params: { text } });
    return res.data.dataUrl;
  },

  // --- SpotiFLAC (фаза D) ---
  spotiflacVersion: async (): Promise<{ version: string | null }> => {
    const res = await api.get('/music/spotiflac/version');
    return res.data;
  },
};
