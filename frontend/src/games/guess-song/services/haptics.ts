/**
 * Тактильный отклик на телефоне игрока.
 *
 * Android: штатный Vibration API — работает везде и всегда.
 *
 * iOS: Safari Vibration API не реализует. Подключён полифил
 * ios-vibrator-pro-max, который добивается отклика через скрытый
 * переключатель (<input type="checkbox" switch>) — на iOS он щёлкает
 * тактильно сам по себе.
 *
 * Что важно знать про этот путь:
 *   · полифил ставит себя ТОЛЬКО на Safari 18 и новее (см. supported-versions
 *     в пакете). На iOS 17 и старше navigator.vibrate просто не появится;
 *   · с iOS 18.4 отклик разрешён лишь внутри пользовательского жеста, и
 *     разрешение живёт около секунды. Поэтому своё нажатие отзывается, а
 *     чужой баззер и итог раунда — нет, жеста там неоткуда взяться;
 *   · засчитывается именно click, поэтому у баззера нажатие обрабатывается
 *     на pointerdown (ради скорости), а отклик вешается отдельно на click.
 *
 * Диагностика на живом устройстве — страница /m/haptics.
 *
 * Полифил грузится ЛЕНИВО и только на iOS: он подменяет геттер document.body
 * своим служебным элементом, и тащить это на проектор, в админку и на Android
 * незачем. Вызывать installHaptics() на страницах, где отклик нужен.
 */
const isIOS = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS 13+ представляется как Mac — отличаем по тач-точкам
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
};

let installed = false;

/** Подключает обход для iOS. На других платформах не делает ничего. */
export const installHaptics = (): void => {
  if (installed || !isIOS()) return;
  installed = true;
  void import('ios-vibrator-pro-max').catch(() => {
    /* не загрузился — просто останемся без отклика */
  });
};

/** Есть ли вообще куда звать: на iOS свойство появляется только от полифила. */
export const hasVibration = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/**
 * Отклик по узору (мс или массив, как у navigator.vibrate).
 *
 * Сброса предыдущего узора здесь НЕТ намеренно. Раньше вызывался
 * navigator.vibrate(0) перед основным: на Android это штатный способ не
 * склеивать узоры, но полифил принимает 0 как обычный узор и ставит
 * нулевую вибрацию — то есть гасит то, что мы только что просили.
 */
export const vibrate = (pattern: number | number[]): void => {
  try {
    if (hasVibration()) navigator.vibrate(pattern);
  } catch {
    /* отклик — приятное дополнение, его отсутствие не должно ломать игру */
  }
};

/**
 * Отклик, привязанный к клику. Отдельное имя — чтобы на месте вызова было
 * видно: это обработчик click, и на iOS он единственный, который считается.
 */
export const hapticTap = (): void => vibrate(30);
