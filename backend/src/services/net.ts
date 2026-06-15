import os from 'os';

// Определяем основной LAN-IP, чтобы телефоны в той же сети могли подключиться.
// В Docker контейнер не видит LAN-IP хоста, поэтому можно переопределить через HOST_IP.
export const lanIp = (): string => {
  if (process.env.HOST_IP) return process.env.HOST_IP;

  const ifaces = os.networkInterfaces();
  const candidates: { name: string; address: string }[] = [];
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) {
        candidates.push({ name, address: ni.address });
      }
    }
  }
  // приоритет приватным диапазонам 192.168 / 10. / 172.16-31
  const priv =
    candidates.find((c) => /^192\.168\./.test(c.address)) ||
    candidates.find((c) => /^10\./.test(c.address)) ||
    candidates.find((c) => /^172\.(1[6-9]|2\d|3[01])\./.test(c.address)) ||
    candidates[0];
  return priv ? priv.address : '127.0.0.1';
};

// База, по которой игроки открывают страницу входа.
// Возвращаем PUBLIC_WEB_BASE если задан, иначе пусто — тогда фронт подставит
// origin, по которому ведущий сам открыл экран (в Docker контейнер не знает
// LAN-IP хоста, а адрес из браузера ведущего — верный).
export const webBase = (): string => process.env.PUBLIC_WEB_BASE || '';
