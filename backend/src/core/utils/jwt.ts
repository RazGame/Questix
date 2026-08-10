import fs from 'fs';
import jwt from 'jsonwebtoken';
import { StringValue } from 'ms';
import { config } from '../config/config';
import { JWTPayload } from '../types';

// Этап 4 (ROADMAP): RS256 вместо симметричного секрета, когда заданы PEM-ключи.
// Облако подписывает приватным ключом; станция проверяет публичным и подделать
// токен не может. Без ключей — прежний HS256 (локальная разработка/станция).
// Алгоритмы пиннятся явно, чтобы исключить подмену alg в токене.

const readKey = (file: string): string | null => {
  if (!file) return null;
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    console.error(`❌ Не удалось прочитать JWT-ключ ${file}:`, error);
    // Ключ указан, но не читается — это ошибка конфигурации, не тихий фолбэк.
    throw new Error(`JWT-ключ недоступен: ${file}`);
  }
};

const privateKey = readKey(config.jwtPrivateKeyFile);
const publicKey = readKey(config.jwtPublicKeyFile);

if (privateKey && !publicKey) {
  // Подписывали бы RS256, а проверяли HS256 — сломан весь auth. Падаем сразу.
  throw new Error('JWT_PRIVATE_KEY_FILE задан без JWT_PUBLIC_KEY_FILE — нужны оба');
}
if (publicKey && !privateKey) {
  // Этап 6: станция. Облачные RS256-токены принимаются (проверка публичным
  // ключом, подделать нельзя), СВОИ токены станция подписывает локальным
  // HS256-секретом — иначе офлайн (без облака) в пульт было бы не войти.
  console.log('🔑 JWT: станция — облачные RS256 + локальные HS256');
} else if (privateKey && publicKey) {
  console.log('🔑 JWT: RS256 (подпись и проверка)');
}

export const generateToken = (payload: JWTPayload): string => {
  if (privateKey) {
    return jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
      expiresIn: config.jwtExpire as StringValue,
    });
  }
  return jwt.sign(payload, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpire as StringValue,
  });
};

export const verifyToken = (token: string): JWTPayload => {
  // Станция: сперва облачная подпись RS256, затем локальная HS256.
  // Алгоритм всегда пиннится к соответствующему ключу — подмена alg
  // (HS256-токен «подписанный» публичным ключом) не проходит.
  if (publicKey) {
    try {
      return jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as JWTPayload;
    } catch (rsError) {
      if (privateKey) throw rsError; // облако: только RS256, фолбэка нет
      return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as JWTPayload;
    }
  }
  return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as JWTPayload;
};
