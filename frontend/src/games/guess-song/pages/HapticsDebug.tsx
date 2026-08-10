import { useEffect, useRef, useState } from 'react';
import { hasVibration, vibrate , installHaptics } from '../services/haptics';

/**
 * Диагностика тактильного отклика — открывается на живом телефоне (/m/haptics).
 *
 * Нужна потому, что iOS проверить со стороны разработчика невозможно: Safari
 * не реализует Vibration API, обходной путь недокументирован, а ведёт себя
 * по-разному в зависимости от версии. Страница показывает, что видит браузер,
 * и даёт нажать каждый способ по очереди — так становится видно, какой из них
 * (если хоть какой-то) на конкретном устройстве отзывается.
 */

// Тот же приём, что внутри полифила: щелчок по label, привязанному к
// переключателю. Разница между вариантами — видим ли элемент на экране:
// есть подозрение, что iOS не даёт отклик невидимым контролам.
const makeSwitch = (visible: boolean) => {
  const label = document.createElement('label');
  label.style.cssText = visible
    ? 'position:fixed;bottom:8px;right:8px;width:52px;height:32px;opacity:0.01;z-index:0'
    : 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.setAttribute('style', 'display: none !important');
  input.tabIndex = -1;
  label.appendChild(input);
  document.documentElement.appendChild(label);
  return label;
};

export default function HapticsDebug() {
  const [log, setLog] = useState<string[]>([]);
  const hiddenRef = useRef<HTMLLabelElement | null>(null);
  const visibleRef = useRef<HTMLLabelElement | null>(null);

  useEffect(() => {
    installHaptics(); // на iOS подтягивает полифил, иначе ничего не делает
    hiddenRef.current = makeSwitch(false);
    visibleRef.current = makeSwitch(true);
    return () => {
      hiddenRef.current?.remove();
      visibleRef.current?.remove();
    };
  }, []);

  const say = (msg: string) =>
    setLog((prev) => [`${new Date().toLocaleTimeString()} — ${msg}`, ...prev].slice(0, 12));

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const safariVersion = ua.match(/Version\/(\d+(\.\d+)?)/)?.[1]
    || ua.match(/iPhone OS (\d+(_\d+)?)/)?.[1]?.replace('_', '.')
    || 'не определилась';

  const facts: [string, string][] = [
    ['navigator.vibrate', hasVibration() ? 'есть' : 'НЕТ — вибрация невозможна'],
    ['версия Safari/iOS', String(safariVersion)],
    ['полифил ставится с', '18.0 (с 18.4 — только внутри клика)'],
    ['это iPhone/iPad', /iPhone|iPad|iPod/.test(ua) ? 'да' : 'нет'],
    ['user agent', ua],
  ];

  return (
    <div className="mx-auto max-w-lg px-4 py-6 text-left">
      <h1 className="font-display mb-1 text-2xl font-bold">Проверка вибрации</h1>
      <p className="mb-5 text-sm text-zinc-400">
        Нажимайте кнопки по очереди и запоминайте, на какой телефон отозвался.
        Нажимать нужно пальцем: на iOS отклик разрешён только внутри касания.
      </p>

      <div className="glass mb-5 p-4 text-xs">
        {facts.map(([k, v]) => (
          <div key={k} className="flex gap-2 border-b border-white/5 py-1 last:border-0">
            <span className="w-40 shrink-0 text-zinc-500">{k}</span>
            <span className="min-w-0 break-all text-zinc-200">{v}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-2">
        <button
          onClick={() => { vibrate(200); say('1. vibrate(200) — обычный вызов'); }}
          className="btn-grad rounded-lg py-3 font-bold"
        >
          1 · Обычная вибрация 200 мс
        </button>
        <button
          onClick={() => { vibrate([100, 50, 100]); say('2. vibrate([100,50,100]) — узор'); }}
          className="rounded-lg border border-white/10 bg-white/5 py-3 font-bold text-zinc-200"
        >
          2 · Узором: 100–50–100
        </button>
        <button
          onClick={() => { hiddenRef.current?.click(); say('3. щелчок по СКРЫТОМУ переключателю'); }}
          className="rounded-lg border border-white/10 bg-white/5 py-3 font-bold text-zinc-200"
        >
          3 · Скрытый переключатель
        </button>
        <button
          onClick={() => { visibleRef.current?.click(); say('4. щелчок по ВИДИМОМУ переключателю'); }}
          className="rounded-lg border border-white/10 bg-white/5 py-3 font-bold text-zinc-200"
        >
          4 · Видимый переключатель
        </button>
        <button
          onTouchEnd={() => { vibrate(200); say('5. vibrate из touchend (не click)'); }}
          className="rounded-lg border border-white/10 bg-white/5 py-3 font-bold text-zinc-200"
        >
          5 · Из касания, а не клика
        </button>
      </div>

      <p className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Что нажимали
      </p>
      <div className="glass max-h-52 overflow-y-auto p-3 font-mono text-[11px] text-zinc-400">
        {log.length === 0 ? <p className="text-zinc-600">пока ничего</p>
          : log.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}
