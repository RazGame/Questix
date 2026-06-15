import { Link } from 'react-router-dom';
import { Compass, Users, Trophy, ArrowRight } from 'lucide-react';

const features = [
  {
    icon: Compass,
    code: '01 // explore',
    title: 'Квесты',
    text: 'Каталог городских квестов: выбирай предстоящие игры и следи за активными.',
  },
  {
    icon: Users,
    code: '02 // team_up',
    title: 'Команда',
    text: 'Собери свою команду, зови друзей по нику и проходите задания вместе.',
  },
  {
    icon: Trophy,
    code: '03 // win',
    title: 'Призы',
    text: 'Итоговая таблица, статистика по заданиям и призы для самых быстрых.',
  },
];

export default function Home() {
  return (
    <div className="overflow-hidden text-white">
      <div className="max-w-7xl mx-auto px-4 pt-16 md:pt-24 pb-16 text-center relative">
        {/* Декоративное свечение за заголовком */}
        <div
          aria-hidden
          className="absolute left-1/2 top-0 -translate-x-1/2 w-[40rem] h-[40rem] rounded-full bg-primary/20 blur-3xl pointer-events-none"
        />

        <p className="tech-label mb-6 relative">[ городские квесты для команд ]</p>

        <h1 className="relative font-display text-5xl md:text-7xl font-bold mb-6 leading-tight">
          QUEST
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-fuchsia-400 to-amber-300">
            IX
          </span>
        </h1>

        <p className="relative text-lg md:text-2xl text-zinc-300 max-w-2xl mx-auto mb-12">
          Собери команду, реши задания быстрее всех
          <br className="hidden md:block" /> и забери приз.
        </p>

        <div className="relative flex flex-col sm:flex-row gap-4 justify-center mb-20">
          <Link
            to="/games"
            className="btn-grad inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold text-lg"
          >
            Найти квест <ArrowRight size={20} />
          </Link>
          <Link
            to="/teams"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold text-lg bg-white/5 border border-white/10 text-zinc-200 hover:bg-white/10 hover:border-primary/40 transition"
          >
            Создать команду
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-5 text-left">
          {features.map(({ icon: Icon, code, title, text }) => (
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
      </div>
    </div>
  );
}
