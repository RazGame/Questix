import crypto from 'crypto';
import { Game } from '../../../core/models/Game';
import { Song } from '../models/Song';
import { ISong } from '../../../core/types';

// Эфемерный id игрока для анонимного входа (хранится в localStorage телефона).
export const newPlayerId = (): string => crypto.randomUUID();

// Короткий код входа без похожих символов (как в прототипе).
export const generateJoinCode = async (): Promise<string> => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from(
      { length: 4 },
      () => alphabet[Math.floor(Math.random() * alphabet.length)]
    ).join('');
  } while (await Game.exists({ code }));
  return code;
};

export interface PlaylistItem extends ISong {
  blockName: string;
  blitzMode: boolean;   // режимы блока, к которому принадлежит песня
  reverseMode: boolean;
  coverHint: boolean;
}

// Упорядоченный список песен игры по блокам (для воспроизведения).
export const buildPlaylist = async (gameId: string): Promise<PlaylistItem[]> => {
  const game = await Game.findById(gameId).lean();
  if (!game || !game.blocks) return [];

  const songs = await Song.find({ gameId }).lean();
  const byId = new Map(songs.map((s) => [String(s._id), s]));

  const list: PlaylistItem[] = [];
  for (const block of game.blocks) {
    for (const sid of block.songIds || []) {
      const song = byId.get(String(sid));
      if (song) list.push({
        ...(song as any),
        blockName: block.name,
        blitzMode: !!(block as any).blitzMode,
        reverseMode: !!(block as any).reverseMode,
        coverHint: !!(block as any).coverHint,
      });
    }
  }
  return list;
};
