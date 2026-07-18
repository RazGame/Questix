import dotenv from 'dotenv';

dotenv.config();

const isProduction = (process.env.NODE_ENV || 'development') === 'production';

// В production секрет обязателен: без него токены подписывались бы известной
// строкой, что равносильно полному обходу авторизации. Падаем на старте.
const jwtSecret = process.env.JWT_SECRET;
if (isProduction && !jwtSecret) {
  throw new Error('JWT_SECRET не задан — обязателен в production. Задайте переменную окружения.');
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/quest',
  // Дефолт допустим только в dev; в production отсутствие отлавливается выше.
  jwtSecret: jwtSecret || 'dev_only_insecure_secret',
  jwtExpire: process.env.JWT_EXPIRE || '7d',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
  corsOrigin: process.env.CORS_ORIGIN,
};
