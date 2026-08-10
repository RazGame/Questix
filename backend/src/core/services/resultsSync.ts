import { config } from '../config/config';
import { SessionResult } from '../models/SessionResult';

// Отправка неотправленных итогов вечеринок в облако (ROADMAP этап 5).
// Server-to-server: станция шлёт в QUESTIX_CLOUD_URL с bearer-токеном
// организатора (облако проверит подпись RS256). Апсерт по resultId на той
// стороне делает повторную отправку безопасной.

export interface SyncSummary {
  sent: number;
  failed: number;
  pending: number; // осталось неотправленных после прогона
}

export const sendPendingResults = async (bearerToken: string): Promise<SyncSummary> => {
  if (!config.questixCloudUrl) {
    return { sent: 0, failed: 0, pending: 0 };
  }

  const pendingDocs = await SessionResult.find({ sentAt: null }).sort('finishedAt');
  let sent = 0;
  let failed = 0;

  for (const doc of pendingDocs) {
    try {
      const res = await fetch(`${config.questixCloudUrl}/results`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          resultId: doc.resultId,
          gameId: doc.gameId,
          kind: doc.kind,
          title: doc.title,
          mode: doc.mode,
          finishedAt: doc.finishedAt,
          standings: doc.standings,
        }),
      });
      if (!res.ok) {
        failed += 1;
        const text = await res.text().catch(() => '');
        console.error(`Облако отклонило результат ${doc.resultId}: ${res.status} ${text}`);
        continue;
      }
      doc.sentAt = new Date();
      await doc.save();
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error(`Не удалось отправить результат ${doc.resultId}:`, error);
    }
  }

  const pending = await SessionResult.countDocuments({ sentAt: null });
  return { sent, failed, pending };
};

// Автоотправка при старте станции — только если в env оставлен токен
// организатора (QUESTIX_CLOUD_TOKEN). Без него отправка идёт с пульта.
export const autoSendOnBoot = async (): Promise<void> => {
  if (!config.questixCloudUrl || !config.questixCloudToken) return;
  try {
    const summary = await sendPendingResults(config.questixCloudToken);
    if (summary.sent || summary.failed) {
      console.log(`📤 Итоги вечеринок: отправлено ${summary.sent}, ошибок ${summary.failed}, осталось ${summary.pending}`);
    }
  } catch (error) {
    console.error('Автоотправка итогов не удалась:', error);
  }
};
