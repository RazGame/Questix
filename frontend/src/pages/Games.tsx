import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { gameService } from '../services/games';
import { applService } from '../services/appls';
import { Game, GameAppl } from '../types';
import { useAuthStore } from '../store/authStore';
import { CalendarCheck, CalendarClock, MapPin, Trophy } from 'lucide-react';
import { formatDateTime, getQuestState } from '../utils/date';

type QuestTab = 'active' | 'upcoming' | 'finished';

const toPlainText = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export default function Games() {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const [games, setGames] = useState<Game[]>([]);
  const [myAppls, setMyAppls] = useState<GameAppl[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<QuestTab>('upcoming');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    loadGames();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const myActiveCount = getMyActiveGames().length;

    if (myActiveCount > 0 && activeTab === 'upcoming') {
      setActiveTab('active');
    }

    if (myActiveCount === 0 && activeTab === 'active') {
      setActiveTab('upcoming');
    }
  }, [games, myAppls, now, activeTab]);

  const loadGames = async () => {
    try {
      setIsLoading(true);
      setError('');
      const [gamesData, applsData] = await Promise.all([
        gameService.getAllGames(),
        token ? applService.getMyAppls() : Promise.resolve([]),
      ]);
      setGames(gamesData);
      setMyAppls(Array.isArray(applsData) ? applsData : []);
    } catch (err: any) {
      setError('Ошибка загрузки квестов');
    } finally {
      setIsLoading(false);
    }
  };

  const getMyActiveGames = () => {
    const activeGameIds = new Set(
      myAppls
        .filter((appl) => {
          const game = (appl as any).gameId;
          return (
            appl.status === 'approved' &&
            getQuestState(game?.dateofstart, game?.dateofend, now) === 'active'
          );
        })
        .map((appl) => (appl as any).gameId?._id)
        .filter(Boolean)
    );

    return games.filter((game) => activeGameIds.has(game._id));
  };

  const myActiveGames = getMyActiveGames();
  const upcomingGames = games.filter(
    (game) => getQuestState(game.dateofstart, game.dateofend, now) === 'scheduled'
  );
  const finishedGames = games.filter(
    (game) => getQuestState(game.dateofstart, game.dateofend, now) === 'finished'
  );

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-4">
        <p className="text-center text-lg">Загружается...</p>
      </div>
    );
  }

  const filteredGames =
    activeTab === 'active'
      ? myActiveGames
      : activeTab === 'finished'
        ? finishedGames
        : upcomingGames;

  const tabCounts = {
    active: myActiveGames.length,
    upcoming: upcomingGames.length,
    finished: finishedGames.length,
  };

  const tabs: { id: QuestTab; label: string }[] = [
    ...(myActiveGames.length > 0
      ? [{ id: 'active' as const, label: 'Мои активные квесты' }]
      : []),
    { id: 'upcoming', label: 'Предстоящие' },
    { id: 'finished', label: 'Завершённые' },
  ];

  return (
    <div className="max-w-7xl mx-auto p-4 py-8">
      <p className="tech-label mb-2">[ каталог ]</p>
      <h1 className="text-4xl font-bold mb-6">Квесты</h1>

      <div className="flex flex-wrap gap-2 mb-8 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 font-bold border-b-2 transition ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {tab.label} ({tabCounts[tab.id]})
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded">
          {error}
        </div>
      )}

      {filteredGames.length === 0 ? (
        <p className="text-center text-zinc-400">Квестов не найдено</p>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGames.map((game) => (
            <div
              key={game._id}
              className="glass glass-hover overflow-hidden cursor-pointer"
              onClick={() => navigate(`/games/${game._id}`)}
            >
              <div className="bg-gradient-to-r from-violet-600/50 to-fuchsia-600/30 border-b border-white/10 p-4">
                <h3 className="font-display text-lg font-bold text-white">{game.title}</h3>
              </div>

              <div className="p-4">
                <div className="space-y-2 mb-4">
                  <div className="flex items-center text-zinc-400">
                    <MapPin size={18} className="mr-2" />
                    {game.city}
                  </div>
                  <div className="flex items-start text-zinc-400">
                    <CalendarClock size={18} className="mr-2 mt-1 shrink-0" />
                    <div>
                      <span className="block text-xs text-zinc-500">Начало</span>
                      {formatDateTime(game.dateofstart)}
                    </div>
                  </div>
                  <div className="flex items-start text-zinc-400">
                    <CalendarCheck size={18} className="mr-2 mt-1 shrink-0" />
                    <div>
                      <span className="block text-xs text-zinc-500">Окончание</span>
                      {formatDateTime(game.dateofend)}
                    </div>
                  </div>
                  <div className="flex items-center text-zinc-400">
                    <Trophy size={18} className="mr-2" />
                    Приз: {game.prize}
                  </div>
                </div>

                <p className="text-zinc-400 text-sm mb-4">
                  {toPlainText(game.description).substring(0, 100)}...
                </p>

                <button className="w-full btn-grad py-2 rounded transition">
                  Подробнее
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
