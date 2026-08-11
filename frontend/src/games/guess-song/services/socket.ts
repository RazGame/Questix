import { io, Socket } from 'socket.io-client';
import { defaultApiOrigin } from '../../../core/services/apiOrigin';

// Базовый origin backend: тот же хост, что и фронт (важно для оффлайн-LAN,
// когда телефон открывает страницу по LAN-IP компьютера).
const socketUrl = import.meta.env.VITE_SOCKET_URL || defaultApiOrigin();

// Создаёт новый Socket.IO-коннект. token нужен только для роли ведущего (admin).
// transports: ['websocket'] — без polling-апгрейда, ради минимальных задержек.
export const createSocket = (token?: string | null): Socket =>
  io(socketUrl, {
    transports: ['websocket'],
    auth: token ? { token } : undefined,
  });
