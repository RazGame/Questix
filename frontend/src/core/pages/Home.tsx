import { Link } from 'react-router-dom';
import { Compass, Music, Users, QrCode, ArrowRight } from 'lucide-react';
import { usePlatformInfo, kindAvailable } from '../services/platform';

// Виды игр платформы. Отображаются те, что доступны в текущем режиме
// (на локальной станции квестов нет — см. /platform/info).
const games = [
  {
    kind: 'quest',
    icon: Compass,
    code: '01 // quest',
    title: 'Квесты',
    text: 'Городские квесты по заданиям: команда или одиночка, время вместо очков, ' +
      'бонусы и штрафы от организатора.',
  },
  {
    kind: 'guess_song',
    icon: Music,
    code: '02 // guess_song',
    title: 'Угадай мелодию',
    text: 'Вечеринка с баззерами: музыка на проекторе, телефоны вместо кнопок, ' +
      'счёт по игрокам или по столам.',
  },
];

const howItWorks = [
  {
    icon: QrCode,
    code: 'a // join',
    title: 'Вход за секунды',
    text: 'Игроки заходят по QR-коду или короткому коду игры. С регистрацией — ' +
      'если нужна история и рейтинг, без неё — если гости пришли на один вечер.',
  },
  {
    icon: Users,
    code: 'b // teams',
    title: 'Одному или командой',
    text: 'Команды Questix для постоянных игроков или команды прямо на месте: ' +
      'назвал стол — и вы уже играете вместе.',
  },
];

export default function Home() {
  const platform = usePlatformInfo();
  const availableGames = games.filter((g) => kindAvailable(platform, g.kind));
  const questAvailable = kindAvailable(platform, 'quest');

  return (
    <div className="overflow-hidden text-white">
      <div className="max-w-7xl mx-auto px-4 pt-16 md:pt-24 pb-16 text-center relative">
        {/* Декоративное свечение за заголовком */}
        <div
          aria-hidden
          className="absolute left-1/2 top-0 -translate-x-1/2 w-[40rem] h-[40rem] rounded-full bg-primary/20 blur-3xl pointer-events-none"
        />

        <p className="tech-label mb-6 relative">[ платформа для игр и вечеринок ]</p>

        <h1 className="relative font-display text-5xl md:text-7xl font-bold mb-6 leading-tight">
          QUEST
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-fuchsia-400 to-amber-300">
            IX
          </span>
        </h1>

        <p className="relative text-lg md:text-2xl text-zinc-300 max-w-2xl mx-auto mb-12">
          Одна платформа для разных игр: городские квесты и музыкальные вечеринки.
          <br className="hidden md:block" /> Собирайте, проводите, ведите счёт.
        </p>

        <div className="relative flex flex-col sm:flex-row gap-4 justify-center mb-20">
          {questAvailable && (
            <Link
              to="/games"
              className="btn-grad inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold text-lg"
            >
              Найти игру <ArrowRight size={20} />
            </Link>
          )}
          <Link
            to="/join"
            className={`inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold text-lg transition ${
              questAvailable
                ? 'bg-white/5 border border-white/10 text-zinc-200 hover:bg-white/10 hover:border-primary/40'
                : 'btn-grad'
            }`}
          >
            <QrCode size={20} /> Войти по коду
          </Link>
        </div>

        <div className="grid gap-5 text-left md:grid-cols-2">
          {availableGames.map(({ icon: Icon, code, title, text }) => (
            <div key={title} className="glass glass-hover p-7">
              <div className="flex items-center justify-between mb-5">
                <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600/30 to-fuchsia-600/30 border border-white/10 flex items-center justify-center">
                  <Icon size={22} className="text-violet-300" />
                </span>
                <span className="font-mono text-xs text-zinc-500">{code}</span>
              </div>
              <h3 className="font-display text-lg font-bold mb-2">{title}</h3>
              <p className="text-zinc-400 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-5 text-left md:grid-cols-2">
          {howItWorks.map(({ icon: Icon, code, title, text }) => (
            <div key={title} className="glass p-7">
              <div className="flex items-center justify-between mb-5">
                <span className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <Icon size={22} className="text-zinc-300" />
                </span>
                <span className="font-mono text-xs text-zinc-500">{code}</span>
              </div>
              <h3 className="font-display text-lg font-bold mb-2">{title}</h3>
              <p className="text-zinc-400 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
