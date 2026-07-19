import { useEffect, useState } from 'react';
import api from './api';

// Информация о профиле платформы (этап 6): в режиме станции backend
// поднимает только offline-модули, фронт по kinds скрывает лишние разделы.

export interface PlatformInfo {
  mode: 'cloud' | 'station' | 'all';
  kinds: string[];
}

const FALLBACK: PlatformInfo = { mode: 'all', kinds: ['quest', 'guess_song'] };

let cached: PlatformInfo | null = null;
let inflight: Promise<PlatformInfo> | null = null;

export const getPlatformInfo = (): Promise<PlatformInfo> => {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = api
      .get('/platform/info')
      .then((res) => {
        cached = res.data as PlatformInfo;
        return cached;
      })
      .catch(() => FALLBACK); // старый backend без роута — показываем всё
  }
  return inflight;
};

// Хук: до ответа возвращает null — вызывающий сам решает, что показать
// (обычно показываем всё, чтобы не мигало в режимах all/cloud).
export const usePlatformInfo = (): PlatformInfo | null => {
  const [info, setInfo] = useState<PlatformInfo | null>(cached);
  useEffect(() => {
    if (!info) getPlatformInfo().then(setInfo);
  }, [info]);
  return info;
};

// Утилита: доступен ли вид игры (null = ещё грузим → считаем доступным).
export const kindAvailable = (info: PlatformInfo | null, kind: string): boolean =>
  !info || info.kinds.includes(kind);
