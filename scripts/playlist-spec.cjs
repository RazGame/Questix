/**
 * Что добавляем в игру «Шазам запрещён 2» (код 83XC).
 *
 * Аудитория — коллеги 22–40 лет (родились 1986–2004). Их «свои» годы:
 * для старших — девяностые и нулевые, для младших — 2015–2022. Отсюда упор
 * на 2017-й (просьба заказчика), русский поп 2010-х (единственная явная дыра
 * в игре: рэп тех лет есть, попа нет) и свежак последних лет.
 *
 * a / t — исполнитель и название по отдельности: так поиск не подсовывает
 * пародии и чужие треки с похожим названием (см. scripts/match.cjs).
 * start — начало отрезка: за ~3 секунды до припева, длительность 20 с.
 * Значения проставлены по знанию треков и уточняются по звуку
 * (scripts/refine-segments.cjs).
 */

// --- добивка существующих блоков до 10 песен (+3 в каждый из 12) ---
const TOPUP = {
  'Русский поп 2000-х': [
    { a: 't.A.T.u.', t: 'Нас не догонят', start: 46 },
    { a: 'Звери', t: 'Районы-кварталы', start: 40 },
    { a: "Глюк'oZa", t: 'Невеста', start: 38 },
  ],
  'MTV / зарубежка 2000-х': [
    { a: 'OutKast', t: 'Hey Ya!', start: 33 },
    { a: 'Coldplay', t: 'Viva La Vida', start: 55 },
    { a: 'OneRepublic', t: 'Apologize', start: 47 },
  ],
  'Русский рок': [
    { a: 'Король и Шут', t: 'Кукла колдуна', start: 42 },
    { a: 'Мумий Тролль', t: 'Владивосток 2000', start: 52 },
    { a: 'ДДТ', t: 'Что такое осень', start: 44 },
  ],
  'Русский рэп / хип-хоп 2010-х': [
    { a: 'MiyaGi & Endspiel', t: 'I Got Love', start: 40 },
    { a: 'Каспийский Груз', t: 'Табор уходит в небо', start: 46 },
    { a: 'Баста', t: 'Выпускной', start: 58 },
  ],
  'Танцпол 2010-х': [
    { a: 'PSY', t: 'Gangnam Style', start: 44 },
    { a: 'Mark Ronson', t: 'Uptown Funk', start: 66 },
    { a: 'Icona Pop', t: 'I Love It', start: 28 },
  ],
  'Песни, которые все внезапно знают': [
    { a: 'Юрий Шатунов', t: 'Белые розы', start: 52 },
    { a: 'Комбинация', t: 'American Boy', start: 44 },
    { a: 'Сектор Газа', t: 'Лирика', start: 46 },
  ],
  'Кино, сериалы, мульты, реклама': [
    { a: 'Ramin Djawadi', t: 'Main Title', start: 22 },
    { a: 'Whitney Houston', t: 'I Will Always Love You', start: 116 },
    { a: 'Alexey Shelygin', t: 'Бригада', start: 30 },
  ],
  'Интернет, мемы': [
    { a: 'Darude', t: 'Sandstorm', start: 62 },
    { a: 'Rednex', t: 'Cotton Eye Joe', start: 30 },
    { a: 'Витас', t: 'Опера №2', start: 56 },
  ],
  'Для тех, кто слушал не как все': [
    { a: 'Rammstein', t: 'Du Hast', start: 78 },
    { a: 'The Offspring', t: 'Pretty Fly (For A White Guy)', start: 40 },
    { a: 'Muse', t: 'Uprising', start: 66 },
  ],
  'Рок-каверы на поп-хиты': [
    { a: 'Our Last Night', t: 'Habits (Stay High)', start: 45 },
    { a: 'Our Last Night', t: 'Beauty And A Beat', start: 43 },
    { a: 'Fame on Fire', t: 'Black Widow', start: 47 },
  ],
  'MTV 2015-2018 / EDM-pop': [
    { a: 'Sia', t: 'Cheap Thrills', start: 48 },
    { a: 'Clean Bandit', t: 'Rockabye', start: 52 },
    { a: 'DJ Snake', t: 'Let Me Love You', start: 44 },
  ],
  // Блок собран по актуальному чарту Яндекс Музыки, поэтому добиваем
  // его продолжением того же чарта (позиции 7-9 на 10.08.2026), а не
  // хитами прошлых лет.
  'Что сейчас играет у зумеров': [
    { a: 'YG IMMA', t: 'TAMAM', start: 25 },
    { a: 'VILLIAN', t: 'ДИНАСТИЯ', start: 35 },
    { a: 'Toxi$', t: 'ЗНАК', start: 45 },
  ],
};

// --- новые блоки по 10 песен ---
const NEW_BLOCKS = [
  {
    name: '2017 — год, который все помнят',
    songs: [
      { a: 'Luis Fonsi', t: 'Despacito', start: 42 },
      { a: 'Ed Sheeran', t: 'Shape of You', start: 41 },
      { a: 'Элджей', t: 'Розовое вино', start: 38 },
      { a: 'Imagine Dragons', t: 'Believer', start: 48 },
      { a: 'Время и Стекло', t: 'Тролль', start: 44 },
      { a: 'Post Malone', t: 'rockstar', start: 36 },
      { a: 'Charlie Puth', t: 'Attention', start: 46 },
      { a: 'Portugal. The Man', t: 'Feel It Still', start: 30 },
      { a: 'LOBODA', t: 'Твои глаза', start: 50 },
      { a: 'The Chainsmokers', t: 'Something Just Like This', start: 62 },
    ],
  },
  {
    name: 'Русский поп 2010-х',
    songs: [
      { a: 'Время и Стекло', t: 'Имя 505', start: 44 },
      { a: 'LOBODA', t: 'Пуля-дура', start: 46 },
      { a: 'Мот', t: 'Капкан', start: 48 },
      { a: 'Егор Крид', t: 'Самая самая', start: 42 },
      { a: 'Gradusy', t: 'Голая', start: 49 },
      { a: 'Артик и Асти', t: 'Грустный дэнс', start: 44 },
      { a: 'MONATIK', t: 'Кружит', start: 50 },
      { a: 'Zivert', t: 'Life', start: 40 },
      { a: 'Ёлка', t: 'Прованс', start: 46 },
      { a: 'Нюша', t: 'Выше', start: 44 },
    ],
  },
  {
    name: '2020–2022: эпоха карантина',
    songs: [
      { a: 'The Weeknd', t: 'Blinding Lights', start: 42 },
      { a: 'Tones and I', t: 'Dance Monkey', start: 46 },
      { a: 'Dua Lipa', t: 'Levitating', start: 48 },
      { a: 'Cream Soda', t: 'Плачу на техно', start: 52 },
      { a: 'Три дня дождя', t: 'Демоны', start: 44 },
      { a: 'Miyagi & Andy Panda', t: 'Kosandra', start: 40 },
      { a: 'Måneskin', t: 'Beggin', start: 38 },
      { a: 'Glass Animals', t: 'Heat Waves', start: 50 },
      { a: 'Olivia Rodrigo', t: 'good 4 u', start: 44 },
      { a: 'Zivert', t: 'Credo', start: 42 },
    ],
  },
  {
    name: 'Под что встаёт весь зал',
    songs: [
      { a: 'Ленинград', t: 'Экспонат', start: 54 },
      { a: 'Верка Сердючка', t: 'Всё будет хорошо', start: 44 },
      { a: 'Mikhail Shufutinsky', t: '3-е сентября', start: 62 },
      { a: 'Стас Михайлов', t: 'Всё для тебя', start: 56 },
      { a: 'Village People', t: 'Y.M.C.A.', start: 57 },
      { a: 'Земляне', t: 'Трава у дома', start: 50 },
      // Boney M. и Gloria Gaynor источник не отдал — взял Ottawan
      { a: 'Ottawan', t: 'Hands Up', start: 40 },
      { a: 'ABBA', t: 'Gimme! Gimme! Gimme!', start: 48 },
      { a: 'Modern Talking', t: "You're My Heart, You're My Soul", start: 40 },
      { a: 'Сектор Газа', t: 'Ночь перед Рождеством', start: 42 },
    ],
  },
  {
    name: 'Дискотека 90-х',
    songs: [
      { a: 'Ace of Base', t: 'All That She Wants', start: 40 },
      { a: 'Haddaway', t: 'What Is Love', start: 44 },
      { a: 'Dr. Alban', t: "It's My Life", start: 38 },
      { a: 'SNAP!', t: 'Rhythm Is a Dancer', start: 42 },
      { a: 'Corona', t: 'The Rhythm Of The Night', start: 42 },
      { a: 'La Bouche', t: 'Be My Lover', start: 46 },
      { a: 'Гости из будущего', t: 'Беги от меня', start: 48 },
      { a: 'Технология', t: 'Нажми на кнопку', start: 44 },
      { a: 'Мираж', t: 'Музыка нас связала', start: 50 },
      { a: 'Кар-Мэн', t: 'Лондон гуд бай', start: 42 },
    ],
  },
  {
    name: 'Один хит — и тишина',
    songs: [
      { a: 'Chumbawamba', t: 'Tubthumping', start: 34 },
      { a: 'Los Del Rio', t: 'Macarena', start: 40 },
      { a: 'Vanilla Ice', t: 'Ice Ice Baby', start: 44 },
      { a: 'Aqua', t: 'Barbie Girl', start: 38 },
      { a: 'Baha Men', t: 'Who Let The Dogs Out', start: 30 },
      { a: 'Lou Bega', t: 'Mambo No. 5', start: 36 },
      { a: 'Eiffel 65', t: 'Blue (Da Ba Dee)', start: 42 },
      { a: '4 Non Blondes', t: "What's Up?", start: 62 },
      { a: 'Right Said Fred', t: "I'm Too Sexy", start: 34 },
      { a: 'Toploader', t: 'Dancing in the Moonlight', start: 46 },
    ],
  },
  {
    name: 'Свежак: зарубежка 2023–2025',
    songs: [
      { a: 'Miley Cyrus', t: 'Flowers', start: 44 },
      { a: 'Teddy Swims', t: 'Lose Control', start: 48 },
      { a: 'Sabrina Carpenter', t: 'Espresso', start: 40 },
      { a: 'Billie Eilish', t: 'BIRDS OF A FEATHER', start: 46 },
      { a: 'Benson Boone', t: 'Beautiful Things', start: 52 },
      { a: 'Hozier', t: 'Too Sweet', start: 50 },
      { a: 'Doja Cat', t: 'Paint The Town Red', start: 38 },
      { a: 'Harry Styles', t: 'As It Was', start: 42 },
      { a: 'Tate McRae', t: 'greedy', start: 36 },
      { a: 'Chappell Roan', t: 'Good Luck, Babe!', start: 54 },
    ],
  },
];

module.exports = { TOPUP, NEW_BLOCKS };
