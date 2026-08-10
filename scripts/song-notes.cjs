/**
 * Подсказки ведущему для игры 83XC: что ещё засчитывать за верный ответ.
 * Текст показывается в пульте под заголовком «ЗАСЧИТЫВАТЬ ТАКЖЕ», поэтому
 * формулировки короткие и продолжают эту фразу.
 *
 * Запуск: node scripts/song-notes.cjs [--dry]
 *
 * Идемпотентно: песня ищется по названию и исполнителю, уже совпадающая
 * подсказка не переписывается.
 */
const { scoreCandidate } = require('./match.cjs');

const BASE = process.env.MUSIC_BASE || 'http://localhost:5000';
const CODE = process.env.GAME_CODE || '83XC';
const DRY = process.argv.includes('--dry');

// [исполнитель, название, подсказка]
const NOTES = [
  // Каверы: игрок почти наверняка назовёт оригинального исполнителя
  ['State Champs', 'Stitches', 'кавер, оригинал — Shawn Mendes'],
  ['A Day To Remember', 'Since U Been Gone', 'кавер, оригинал — Kelly Clarkson'],
  ['I Prevail', 'Blank Space', 'кавер, оригинал — Taylor Swift'],
  ['Mayday Parade', 'Somebody That I Used To Know', 'кавер, оригинал — Gotye и Kimbra'],
  ['Wildways', 'Мало тебя', 'кавер, оригинал — SEREBRO'],
  ['Capture The Crown', 'In My Head', 'кавер, оригинал — Jason Derulo'],
  ['Woe, Is Me', 'Last Friday Night', 'кавер, оригинал — Katy Perry'],
  ['Our Last Night', 'Habits (Stay High)', 'кавер, оригинал — Tove Lo'],
  ['Our Last Night', 'Beauty And A Beat', 'кавер, оригинал — Justin Bieber'],
  ['Fame on Fire', 'Black Widow', 'кавер, оригинал — Iggy Azalea и Rita Ora'],

  // Кино и сериалы: назвать фильм — тоже попадание
  ['Smash Mouth', 'All Star', 'фильм «Шрек»'],
  ['Céline Dion', 'My Heart Will Go On', 'фильм «Титаник»'],
  ['Survivor', 'Eye of the Tiger', 'фильм «Рокки 3»'],
  ['The Rembrandts', "I'll Be There for You", 'сериал «Друзья»'],
  ['Hans Zimmer', "He's a Pirate", 'фильм «Пираты Карибского моря»'],
  ['Ramin Djawadi', 'Main Title', 'сериал «Игра престолов» — по названию трека не угадать'],
  ['Whitney Houston', 'I Will Always Love You', 'фильм «Телохранитель»; оригинал песни — Dolly Parton'],
  ['Alexey Shelygin', 'Бригада', 'сериал «Бригада» — исполнителя никто не назовёт'],

  // Мемы: у песни есть «народное» имя
  ['Rick Astley', 'Never Gonna Give You Up', 'рикролл'],
  ['Crazy Frog', 'Axel F', 'мелодия из «Полицейского из Беверли-Хиллз»; «лягушонок»'],
  ['O-Zone', 'Dragostea din tei', '«нума-нума», «маи хи»'],
  ['Las Ketchup', 'The Ketchup Song', '«асерехе», «песня про кетчуп»'],
  ['Little Big', 'Skibidi', '«скибиди» — засчитывать по названию танца'],
  ['Darude', 'Sandstorm', 'мем «Darude — Sandstorm»'],

  // Исполнитель известен под другим именем
  ['Yuri Shatunov', 'Про белые розы', '«Ласковый май» — под этим названием песню знают все'],
];

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${String(text).slice(0, 150)}`);
  return json;
}

async function main() {
  const { token } = await api('POST', '/auth/login', {
    username: process.env.MUSIC_USER || 'design_org@t.io',
    hashed_pwd: process.env.MUSIC_PWD || 'password1',
  });
  const games = await api('GET', '/music/games', null, token);
  const meta = (Array.isArray(games) ? games : games.games || []).find((g) => g.code === CODE);
  if (!meta) throw new Error(`игра ${CODE} не найдена (нет доступа?)`);
  const full = await api('GET', `/music/games/${meta._id}`, null, token);

  let set = 0, same = 0;
  const missing = [];
  for (const [a, t, note] of NOTES) {
    let best = null;
    for (const s of full.songs) {
      const { s: sc } = scoreCandidate({ a, t }, s);
      if (!best || sc > best.sc) best = { song: s, sc };
    }
    if (!best || best.sc < 0.7) { missing.push(`${a} — ${t}`); continue; }
    if ((best.song.note || '') === note) { same++; continue; }
    console.log(`  ${best.song.artist} — ${best.song.title}`);
    console.log(`      → ${note}`);
    if (!DRY) await api('PATCH', `/music/games/${meta._id}/songs/${best.song._id}`, { note }, token);
    set++;
  }

  console.log(`\nпроставлено: ${set}, уже совпадало: ${same}, не нашлось: ${missing.length}`);
  missing.forEach((m) => console.log(`  ? ${m}`));
  if (DRY) console.log('(dry) ничего не сохранял');
}

main().catch((e) => { console.error('ОШИБКА:', e.message); process.exit(1); });
