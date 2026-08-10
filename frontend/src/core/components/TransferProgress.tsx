import { Download, Upload, Loader2 } from 'lucide-react';

// Фазы передачи файла. Между ними прогресс в процентах есть только у 'transfer':
// пока сервер пакует архив (prepare) или распаковывает его (finalize),
// байты не идут, и честнее показать бегущую полосу, чем врать процентами.
export type TransferPhase = 'prepare' | 'transfer' | 'finalize';

export type TransferState = {
  kind: 'download' | 'upload';
  phase: TransferPhase;
  loaded: number;
  total: number; // 0 = размер неизвестен
  title: string;
};

const fmtSize = (bytes: number): string => {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} ГБ`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${bytes} Б`;
};

const phaseText = (t: TransferState): string => {
  if (t.phase === 'prepare') {
    return t.kind === 'download'
      ? 'Собираем архив на сервере — с музыкой это занимает время…'
      : 'Готовим файл к отправке…';
  }
  if (t.phase === 'finalize') {
    return t.kind === 'download'
      ? 'Сохраняем файл…'
      : 'Файл на сервере — распаковываем музыку и создаём игру…';
  }
  return t.kind === 'download' ? 'Скачиваем архив' : 'Отправляем архив на сервер';
};

export default function TransferProgress({ transfer }: { transfer: TransferState | null }) {
  if (!transfer) return null;

  const { kind, phase, loaded, total } = transfer;
  const known = phase === 'transfer' && total > 0;
  const percent = known ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  const Icon = kind === 'download' ? Download : Upload;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="glass w-full max-w-md border-violet-500/20 bg-[#17111f]/95 p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-violet-600/30 to-fuchsia-600/30">
            <Icon size={20} className="text-violet-300" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-bold text-zinc-100">{transfer.title}</p>
            <p className="truncate text-sm text-zinc-400">{phaseText(transfer)}</p>
          </div>
        </div>

        {/* Размер известен — проценты; нет — бегущая полоса (.qgs-loading-track) */}
        <div
          className={`h-2.5 w-full overflow-hidden rounded-full bg-white/10 ${
            known ? '' : 'qgs-loading-track'
          }`}
        >
          {known && (
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          )}
        </div>

        <div className="mt-2 flex items-center justify-between font-mono text-xs text-zinc-400">
          {known ? (
            <>
              <span>{fmtSize(loaded)} из {fmtSize(total)}</span>
              <span className="font-bold text-violet-300">{percent}%</span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" />
                {loaded > 0 ? fmtSize(loaded) : 'ждём сервер'}
              </span>
              <span>не закрывайте вкладку</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
