/**
 * Адрес бэкенда, когда он не задан переменными сборки.
 *
 * Раньше порт 5000 подставлялся к любому протоколу, включая https. Бэкенд на
 * 5000 слушает голый HTTP, поэтому стоило открыть станцию по https — и весь
 * REST с сокетами отваливался без внятной причины. Отдельного порта у нас для
 * TLS нет, поэтому под https считаем, что перед бэкендом стоит прокси на
 * 8443 (по аналогии с 8080 в облачном Caddyfile.ip). Задать точный адрес
 * всегда можно через VITE_API_URL и VITE_SOCKET_URL — они важнее этой догадки.
 */
const HTTP_PORT = 5000;
const TLS_PORT = 8443;

export function defaultApiOrigin(): string {
  if (typeof window === 'undefined') return `http://localhost:${HTTP_PORT}`;
  const { protocol, hostname } = window.location;
  const port = protocol === 'https:' ? TLS_PORT : HTTP_PORT;
  return `${protocol}//${hostname}:${port}`;
}
