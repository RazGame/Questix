import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { gameService } from '../services/games';
import { applService } from '../services/appls';
import { Game, GameAppl } from '../types';
import { useAuthStore } from '../store/authStore';
import { CalendarCheck, CalendarClock, MapPin, Trophy, Users, UserCog } from 'lucide-react';
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
      // Заявки приходят вместе с игрой; отдельный endpoint доступен только модераторам
      setAppls(Array.isArray(data.gameAppls) ? data.gameAppls : []);
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
      await applService.createAppl({ gameId: id! });
      setSuccess('Заявка подана успешно!');
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

  // Создатель игры + соорганизаторы
  const organizerNames = [
    typeof game.createdBy === 'object' ? game.createdBy?.nickname : null,
    ...(game.organizers || []).map((o) => o.nickname),
  ].filter(Boolean) as string[];

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
            {organizerNames.length > 0 && (
              <div className="flex items-start text-lg">
                <UserCog className="mr-3 mt-1 text-primary" />
                <div>
                  <span className="block text-sm text-gray-500">
                    {organizerNames.length > 1 ? 'Организаторы' : 'Организатор'}
                  </span>
                  <span>{organizerNames.join(', ')}</span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-gray-50 p-4 rounded">
            <div className="mb-4">
              <p className="text-gray-600">Депозит: <strong>{game.deposit}</strong></p>
            </div>
            {token ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Заявка подаётся от вашей команды. Подать её может только капитан —{' '}
                  <button
                    onClick={() => navigate('/teams')}
                    className="text-primary underline"
                  >
                    управление командой
                  </button>
                  .
                </p>
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
                {game.published && (
                  <button
                    onClick={() => navigate(`/games/${game._id}/results`)}
                    className="w-full bg-green-500 text-white py-2 rounded hover:bg-green-600 transition"
                  >
                    📊 Посмотреть результаты
                  </button>
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
