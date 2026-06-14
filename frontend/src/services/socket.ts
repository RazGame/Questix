import { io, Socket } from 'socket.io-client';

// Базовый origin backend: тот же хост, что и фронт, порт 5000 (важно для оффлайн-LAN,
// когда телефон открывает страницу по LAN-IP компьютера).
const socketUrl =
  import.meta.env.VITE_SOCKET_URL ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : 'http://localhost:5000');

// Создаёт новый Socket.IO-коннект. token нужен только для роли ведущего (admin).
// transports: ['websocket'] — без polling-апгрейда, ради минимальных задержек.
export const createSocket = (token?: string | null): Socket =>
  io(socketUrl, {
    transports: ['websocket'],
    auth: token ? { token } : undefined,
  });
