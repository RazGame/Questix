import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { gameService } from '../services/games';
import { applService } from '../services/appls';
import { teams, ITeam } from '../services/teams';
import { Game, GameAppl } from '../types';
import { useAuthStore } from '../store/authStore';
import { CalendarCheck, CalendarClock, MapPin, Trophy, Users, UserCog } from 'lucide-react';
import { formatDateTimeShort, getQuestState } from '../utils/date';

export default function GameDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuthStore();

  const [game, setGame] = useState<Game | null>(null);
  const [appls, setAppls] = useState<GameAppl[]>([]);
  const [myAppls, setMyAppls] = useState<GameAppl[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [myTeams, setMyTeams] = useState<ITeam[]>([]);
  const [isTeamsLoading, setIsTeamsLoading] = useState(false);

  useEffect(() => {
    loadGameDetails();
  }, [id]);

  useEffect(() => {
    if (!token) {
      setMyTeams([]);
      setMyAppls([]);
      return;
    }

    loadViewerData();
  }, [token]);

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

  const loadViewerData = async () => {
    try {
      setIsTeamsLoading(true);
      const [teamsData, applsData] = await Promise.all([
        teams.getUserTeams(),
        applService.getMyAppls(),
      ]);
      setMyTeams(teamsData);
      setMyAppls(Array.isArray(applsData) ? applsData : []);
    } catch {
      setMyTeams([]);
      setMyAppls([]);
    } finally {
      setIsTeamsLoading(false);
    }
  };

  const handleApply = async () => {
    if (!token) {
      navigate('/login');
      return;
    }

    if (!isCaptain) {
      return;
    }

    setIsApplying(true);
    setError('');
    try {
      await applService.createAppl({ gameId: id! });
      setSuccess('Заявка подана успешно!');
      await Promise.all([loadGameDetails(), loadViewerData()]);
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
    return <div className="text-center py-10 text-rose-400">Квест не найден</div>;
  }

  const questState = getQuestState(game.dateofstart, game.dateofend, now);
  const isCaptain = myTeams.some((team) => team.captain._id === user?.id);
  const myAppl = myAppls.find((appl) => {
    const applGame = (appl as any).gameId;
    const applGameId = typeof applGame === 'object' ? applGame?._id : applGame;
    return applGameId === game._id;
  });
  const myTeamIds = new Set(myTeams.map((team) => team._id).filter(Boolean));
  const myApplTeamId =
    typeof myAppl?.team === 'object' ? myAppl.team?._id : myAppl?.team;
  const isCurrentTeamAppl = myApplTeamId ? myTeamIds.has(myApplTeamId) : !!myAppl;
  const canEnterGame =
    myAppl?.status === 'approved' && questState === 'active' && isCurrentTeamAppl;
  const canApply = !myAppl && questState === 'scheduled' && isCaptain;
  const applyButtonText = isTeamsLoading
    ? 'Проверяем команду...'
    : canEnterGame
      ? 'Войти в игру'
      : myAppl?.status === 'pending'
        ? 'Заявка на рассмотрении'
        : myAppl?.status === 'approved'
          ? 'Заявка одобрена'
          : myAppl?.status === 'rejected'
            ? 'Заявка отклонена'
            : myAppl?.status === 'completed'
              ? 'Квест завершен'
              : isApplying
      ? 'Отправляется...'
      : questState === 'finished'
        ? 'Квест завершен'
        : questState !== 'scheduled'
          ? 'Подача заявок закрыта'
          : isCaptain
            ? 'Подать заявку'
            : 'Подать заявку';

  const organizers = [
    typeof game.createdBy === 'object' ? game.createdBy : null,
    ...(game.organizers || []),
  ].filter(Boolean);
  const appliedTeams = appls
    .map((appl) => ({
      id: appl.team?._id,
      name: appl.team?.name || appl.teamName,
      status: appl.status,
    }))
    .filter((team) => team.name);

  return (
    <div className="max-w-4xl mx-auto p-4">
      <button
        onClick={() => navigate('/games')}
        className="text-primary hover:underline mb-4"
      >
        ← Назад к квестам
      </button>

      <div className="glass p-6">
        <h1 className="text-4xl font-bold mb-4">{game.title}</h1>

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded">
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
                <span className="block text-sm text-zinc-500">Дата начала</span>
                <span>{formatDateTimeShort(game.dateofstart)}</span>
              </div>
            </div>
            <div className="flex items-start text-lg">
              <CalendarCheck className="mr-3 mt-1 text-primary" />
              <div>
                <span className="block text-sm text-zinc-500">Дата окончания</span>
                <span>{formatDateTimeShort(game.dateofend)}</span>
              </div>
            </div>
            <div className="flex items-center text-lg">
              <Trophy className="mr-3 text-primary" />
              <span>Приз: {game.prize}</span>
            </div>
            {organizers.length > 0 && (
              <div className="flex items-start text-lg">
                <UserCog className="mr-3 mt-1 text-primary" />
                <div>
                  <span className="block text-sm text-zinc-500">
                    {organizers.length > 1 ? 'Организаторы' : 'Организатор'}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {organizers.map((organizer) => (
                      <button
                        key={organizer!._id}
                        type="button"
                        onClick={() => navigate(`/profile/${organizer!._id}`)}
                        className="rounded-full bg-white/5 px-3 py-1 text-sm font-bold text-violet-200 transition hover:bg-white/10 hover:text-white"
                      >
                        @{organizer!.nickname}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {appliedTeams.length > 0 && (
              <div className="flex items-start text-lg">
                <Users className="mr-3 mt-1 text-primary" />
                <div>
                  <span className="block text-sm text-zinc-500">Команды</span>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {appliedTeams.map((team) => (
                      <button
                        key={`${team.id || team.name}-${team.status}`}
                        type="button"
                        onClick={() => team.id && navigate(`/teams/${team.id}`)}
                        disabled={!team.id}
                        className="rounded-full bg-white/5 px-3 py-1 text-sm font-bold text-zinc-200 transition hover:bg-white/10 hover:text-white disabled:cursor-default disabled:hover:bg-white/5"
                      >
                        {team.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 md:pl-6">
            <div className="mb-4">
              <p className="text-zinc-400">Депозит: <strong>{game.deposit}</strong></p>
            </div>
            {token ? (
              <div className="space-y-3">
                {!isTeamsLoading && !isCaptain && (
                  <p className="text-sm text-zinc-400">
                    Заявка подаётся от вашей команды. Подать её может только капитан —{' '}
                    <button
                      onClick={() => navigate('/teams')}
                      className="text-primary underline"
                    >
                      управление командой
                    </button>
                    .
                  </p>
                )}
                <button
                  onClick={() => {
                    if (canEnterGame && myAppl) {
                      navigate(`/game/${game._id}/play/${myAppl._id}`);
                      return;
                    }

                    handleApply();
                  }}
                  disabled={isApplying || isTeamsLoading || (!canApply && !canEnterGame)}
                  className="w-full btn-grad py-2 rounded transition disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale"
                >
                  {applyButtonText}
                </button>
                {!myAppl && questState !== 'scheduled' && (
                  <p className="text-sm text-zinc-400">
                    Заявку можно подать только до старта квеста.
                  </p>
                )}
                {game.published && (
                  <button
                    onClick={() => navigate(`/games/${game._id}/results`)}
                    className="w-full bg-emerald-600 text-white py-2 rounded hover:bg-emerald-500 transition"
                  >
                    📊 Посмотреть результаты
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="w-full btn-grad py-2 rounded transition"
              >
                Войти для подачи заявки
              </button>
            )}
          </div>
        </div>

        <div className="border-t border-white/10 pt-6">
          <h2 className="text-2xl font-bold mb-4">Описание</h2>
          <div
            className="rich-content text-zinc-300"
            dangerouslySetInnerHTML={{ __html: game.description }}
          />
        </div>
      </div>
    </div>
  );
}
