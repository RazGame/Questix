/**
 * Тактильный отклик на телефоне игрока.
 *
 * Android: обычный Vibration API.
 *
 * iOS: Safari не реализует Vibration API — это ограничение Apple, а не наша
 * недоработка. Единственный доступный обход: переключатель
 * <input type="checkbox" switch>, который на iOS 17.4+ сам по себе даёт
 * тактильный щелчок при переключении. Важное следствие — он срабатывает
 * ТОЛЬКО внутри пользовательского жеста (и грант живёт около секунды),
 * поэтому:
 *   · своё нажатие баззера и кнопки «готов» отклик дадут;
 *   · чужой баззер и итог раунда на айфоне промолчат — жеста там нет.
 * На Android отклик есть везде, как и раньше.
 *
 * Приём недокументированный: если Apple его закроет, вызовы просто станут
 * тихо ничего не делать — на игру это не влияет.
 */

const isIOS = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS 13+ представляется как Mac, отличаем по наличию тач-точек
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
};

let tapper: HTMLLabelElement | null = null;

const getTapper = (): HTMLLabelElement | null => {
  if (typeof document === 'undefined') return null;
  if (tapper && tapper.isConnected) return tapper;
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText =
    'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', ''); // именно switch даёт щелчок на iOS
  input.tabIndex = -1;
  label.appendChild(input);
  document.body.appendChild(label);
  tapper = label;
  return label;
};

/**
 * Даёт отклик. pattern — как у navigator.vibrate (мс или массив).
 * Вызывать по возможности прямо из обработчика касания: на iOS иначе тишина.
 */
export const vibrate = (pattern: number | number[]): void => {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(0); // сбрасываем предыдущий узор, иначе они склеиваются
      navigator.vibrate(pattern);
    }
    // На iOS вызов выше — пустышка, поэтому дополнительно щёлкаем
    // переключателем. На Android этой ветки нет: там уже сработало.
    if (isIOS()) getTapper()?.click();
  } catch {
    /* отклик — приятное дополнение, его отсутствие не должно ломать игру */
  }
};
