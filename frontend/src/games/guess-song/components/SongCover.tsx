import { useEffect, useState } from 'react';
import { Music } from 'lucide-react';
import { musicCoverSrc, songArtworkSrc, CoverSize } from '../services/music';

/**
 * Обложка песни с запасными вариантами.
 *
 * Порядок: внешняя картинка → обложка, вшитая в аудиофайл → значок ноты.
 * Второй шаг выручает, когда трека нет во внешнем каталоге (каверы, редкие
 * релизы), когда ссылка протухла и когда на площадке нет интернета —
 * файл-то уже лежит на станции.
 */
export default function SongCover({
  cover,
  songId,
  size = 'md',
  className = '',
  onClick,
  style,
}: {
  cover?: string;
  songId?: string | null; // из состояния сокета приходит null, когда песни нет
  size?: CoverSize;
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  const external = musicCoverSrc(cover, size);
  const embedded = songArtworkSrc(songId, size);
  // Нет внешней ссылки — сразу пробуем файл
  const [src, setSrc] = useState(external || embedded);

  // Песня в строке поменялась — начинаем подбор заново
  useEffect(() => { setSrc(external || embedded); }, [external, embedded]);

  if (!src) {
    // Значок тянется за размером контейнера: тот же компонент стоит и в
    // строке списка 36 px, и в круге проектора на 230 px.
    return (
      <span onClick={onClick} style={style} className={`flex items-center justify-center bg-white/5 text-zinc-600 ${className}`}>
        <Music className="h-1/3 w-1/3" />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className={className}
      onClick={onClick}
      style={style}
      onError={() => {
        // Внешняя не открылась — пробуем вшитую, потом сдаёмся на значок
        if (src !== embedded && embedded) setSrc(embedded);
        else setSrc('');
      }}
    />
  );
}
