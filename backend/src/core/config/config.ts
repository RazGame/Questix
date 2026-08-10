import dotenv from 'dotenv';

dotenv.config();

const isProduction = (process.env.NODE_ENV || 'development') === 'production';

// В production секрет обязателен: без него токены подписывались бы известной
// строкой, что равносильно полному обходу авторизации. Падаем на старте.
const jwtSecret = process.env.JWT_SECRET;
if (isProduction && !jwtSecret) {
  throw new Error('JWT_SECRET не задан — обязателен в production. Задайте переменную окружения.');
}

// Профиль развёртывания (этап 6): cloud — все модули (VPS), station — только
// offline-модули (ноутбук в зале), all — всё сразу (локальная разработка).
const mode = (process.env.MODE || 'all') as 'cloud' | 'station' | 'all';
if (!['cloud', 'station', 'all'].includes(mode)) {
  throw new Error(`Неизвестный MODE: ${mode} (ожидается cloud | station | all)`);
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  mode,
  port: parseInt(process.env.PORT || '5000', 10),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/quest',
  // Дефолт допустим только в dev; в production отсутствие отлавливается выше.
  jwtSecret: jwtSecret || 'dev_only_insecure_secret',
  jwtExpire: process.env.JWT_EXPIRE || '7d',
  // RS256 (этап 4): пути к PEM-ключам. Облако держит оба, станции достаточно
  // публичного (проверяет облачные токены, подделать не может). Если файлы
  // не заданы — работаем на HS256 с jwtSecret, как раньше.
  jwtPrivateKeyFile: process.env.JWT_PRIVATE_KEY_FILE || '',
  jwtPublicKeyFile: process.env.JWT_PUBLIC_KEY_FILE || '',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
  corsOrigin: process.env.CORS_ORIGIN,
  // Этап 5: адрес облака для отправки итогов вечеринок (пусто = не отправляем,
  // мы сами и есть облако). Токен — опционален, только для автоотправки на старте.
  questixCloudUrl: (process.env.QUESTIX_CLOUD_URL || '').replace(/\/+$/, ''),
  questixCloudToken: process.env.QUESTIX_CLOUD_TOKEN || '',
};
