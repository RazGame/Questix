import api from './api';
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

export const musicService = {
  // --- игры ---
  list: async (): Promise<(MusicGame & { songCount: number })[]> => {
    const res = await api.get('/music/games');
    return res.data;
  },
  create: async (title?: string): Promise<MusicGame> => {
    const res = await api.post('/music/games', { title });
    return res.data.game;
  },
  get: async (id: string): Promise<MusicGameFull> => {
    const res = await api.get(`/music/games/${id}`);
    return res.data;
  },
  update: async (id: string, title: string): Promise<MusicGame> => {
    const res = await api.patch(`/music/games/${id}`, { title });
    return res.data.game;
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/music/games/${id}`);
  },

  // --- блоки ---
  addBlock: async (id: string, name?: string): Promise<MusicGame> => {
    const res = await api.post(`/music/games/${id}/blocks`, { name });
    return res.data.game;
  },
  updateBlock: async (id: string, blockId: string, name: string): Promise<MusicGame> => {
    const res = await api.patch(`/music/games/${id}/blocks/${blockId}`, { name });
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
  spotiflacUpdate: async (): Promise<{ version: string | null }> => {
    const res = await api.post('/music/spotiflac/update');
    return res.data;
  },
};
