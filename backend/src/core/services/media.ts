import fs from 'fs';
import path from 'path';

// Каталог медиафайлов (аудио «Угадай мелодии»). В core, т.к. раздаётся
// статикой из index.ts, а пишут туда модули.
// __dirname = <root>/{src|dist}/core/services → три уровня вверх = <root>.
export const MEDIA_DIR = path.join(__dirname, '..', '..', '..', 'media');
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
