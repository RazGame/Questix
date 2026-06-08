import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { gameService } from '../services/games';
import { applService } from '../services/appls';
import { Game, GameAppl } from '../types';
import { useAuthStore } from '../store/authStore';
import { CalendarCheck, CalendarClock, MapPin, Trophy, Users } from 'lucide-react';
import { formatDateTime, getQuestState } from '../utils/date';

export default function GameDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuthStore();

  const [game, setGame] = useState<Game | null>(null);
  const [appls, setAppls] = useState<GameAppl[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    loadGameDetails();
  }, [id]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const loadGameDetails = async () => {
    try {
      setIsLoading(true);
      const data = await gameService.getGameById(id!);
      setGame(data);
      if (token) {
        const appls = await applService.getGameAppls(id!);
        setAppls(appls);
      }
    } catch (err: any) {
      setError('Ошибка загрузки квеста');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = async () => {
    if (!token) {
      navigate('/login');
      return;
    }

    setIsApplying(true);
    setError('');
    try {
      await applService.createAppl({
        gameId: id!,
        teamName: teamName || undefined,
      });
      setSuccess('Заявка подана успешно!');
      setTeamName('');
      setTimeout(() => navigate('/my-appls'), 1500);
    } catch (err: any) {
      setError(
        err.response?.data?.error || 'Ошибка при подаче заявки'
      );
    } finally {
      setIsApplying(false);
    }
  };

  if (isLoading) {
    return <div className="text-center py-10">Загружается...</div>;
  }

  if (!game) {
    return <div className="text-center py-10 text-red-600">Квест не найден</div>;
  }

  const questState = getQuestState(game.dateofstart, game.dateofend, now);
  const canApply = questState === 'scheduled';

  return (
    <div className="max-w-4xl mx-auto p-4">
      <button
        onClick={() => navigate('/games')}
        className="text-primary hover:underline mb-4"
      >
        ← Назад к квестам
      </button>

      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-4xl font-bold mb-4">{game.title}</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-100 text-green-700 rounded">
            {success}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="space-y-4">
            <div className="flex items-center text-lg">
              <MapPin className="mr-3 text-primary" />
              <span>{game.city}</span>
            </div>
            <div className="flex items-start text-lg">
              <CalendarClock className="mr-3 mt-1 text-primary" />
              <div>
                <span className="block text-sm text-gray-500">Дата начала</span>
                <span>{formatDateTime(game.dateofstart)}</span>
              </div>
            </div>
            <div className="flex items-start text-lg">
              <CalendarCheck className="mr-3 mt-1 text-primary" />
              <div>
                <span className="block text-sm text-gray-500">Дата окончания</span>
                <span>{formatDateTime(game.dateofend)}</span>
              </div>
            </div>
            <div className="flex items-center text-lg">
              <Trophy className="mr-3 text-primary" />
              <span>Приз: {game.prize}</span>
            </div>
            <div className="flex items-center text-lg">
              <Users className="mr-3 text-primary" />
              <span>Участников: {appls.length}</span>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded">
            <div className="mb-4">
              <p className="text-gray-600">Депозит: <strong>{game.deposit}</strong></p>
            </div>
            {token ? (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Название команды (опционально)"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  disabled={!canApply}
                  className="w-full border rounded px-3 py-2"
                />
                <button
                  onClick={handleApply}
                  disabled={isApplying || !canApply}
                  className="w-full bg-primary text-white py-2 rounded hover:bg-opacity-90 disabled:bg-gray-400 transition"
                >
                  {isApplying
                    ? 'Отправляется...'
                    : canApply
                      ? 'Подать заявку'
                      : questState === 'finished'
                        ? 'Квест завершен'
                        : 'Подача заявок закрыта'}
                </button>
                {!canApply && (
                  <p className="text-sm text-gray-600">
                    Заявку можно подать только до старта квеста.
                  </p>
                )}
              </div>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-primary text-white py-2 rounded hover:bg-opacity-90 transition"
              >
                Войти для подачи заявки
              </button>
            )}
          </div>
        </div>

        <div className="border-t pt-6">
          <h2 className="text-2xl font-bold mb-4">Описание</h2>
          <p className="text-gray-700 leading-relaxed">{game.description}</p>
        </div>
      </div>
    </div>
  );
}
