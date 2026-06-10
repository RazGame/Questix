import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { progressService } from '../services/progress';
import { gameService } from '../services/games';
import { CurrentTaskResponse, Game } from '../types';
import { Clock, Trophy, CheckCircle } from 'lucide-react';
import { formatDateTime, getQuestState, parseDate } from '../utils/date';

export default function QuestGame() {
  const { gameId, gameApplId } = useParams();
  const navigate = useNavigate();

  const [game, setGame] = useState<Game | null>(null);
  const [currentTask, setCurrentTask] = useState<CurrentTaskResponse | null>(null);
  const [answer, setAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    loadGameData();
  }, [gameId]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (gameStarted && currentTask?.status === 'in_progress') {
      const interval = setInterval(() => {
        setTimeElapsed((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [gameStarted, currentTask]);

  const questState = game
    ? getQuestState(game.dateofstart, game.dateofend, now)
    : 'unknown';

  useEffect(() => {
    if (game && !gameStarted && !currentTask && questState === 'active') {
      startGame();
    }
  }, [game?._id, gameStarted, currentTask, questState]);

  const loadGameData = async () => {
    try {
      setIsLoading(true);

      if (gameId) {
        const gameData = await gameService.getGameById(gameId);
        setGame(gameData);

        // Проверить, может ли команда начать игру
        if (getQuestState(gameData.dateofstart, gameData.dateofend) === 'active') {
          await startGame();
        }
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: 'Ошибка загрузки данных',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const startGame = async () => {
    try {
      if (gameApplId) {
        await progressService.startGame(gameApplId);
        setGameStarted(true);
        await loadCurrentTask();
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.error || 'Ошибка начала игры',
      });
    }
  };

  const loadCurrentTask = async () => {
    try {
      if (gameApplId) {
        const task = await progressService.getCurrentTask(gameApplId);
        setCurrentTask(task);
        setAnswer('');
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: 'Ошибка загрузки задания',
      });
    }
  };

  const handleSubmitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!answer.trim()) {
      setFeedback({ type: 'error', message: 'Введите ответ' });
      return;
    }

    setIsSubmitting(true);

    try {
      if (gameApplId) {
        const result = await progressService.submitAnswer(gameApplId, answer);

        if (result.isCorrect) {
          setFeedback({ type: 'success', message: 'Правильный ответ! ✅' });
          setAnswer('');

          // Загрузить следующее задание через 1 сек
          setTimeout(() => {
            loadCurrentTask();
          }, 1000);
        } else {
          setFeedback({
            type: 'error',
            message: 'Неверный ответ. Попробуйте еще раз! ❌',
          });
        }
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: 'Ошибка при отправке ответа',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return <div className="text-center py-10">Загружается...</div>;
  }

  if (!game) {
    return <div className="text-center py-10 text-rose-400">Квест не найден</div>;
  }

  const gameStartTime = parseDate(game.dateofstart);
  const canStart = questState === 'active';

  if (!canStart) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <div className="bg-primary/10 border border-blue-200 rounded-lg p-6 text-center">
          <h1 className="text-3xl font-bold mb-4">{game.title}</h1>
          <div className="text-xl mb-4 space-y-2">
            <p>
              <strong>Дата начала:</strong>{' '}
              {gameStartTime ? formatDateTime(game.dateofstart) : '-'}
            </p>
            <p>
              <strong>Дата окончания:</strong> {formatDateTime(game.dateofend)}
            </p>
          </div>
          <p className="text-zinc-400">
            {questState === 'finished'
              ? 'Вход в игру уже закрыт'
              : 'Эта страница сама обновится, когда наступит время старта'}
          </p>
        </div>
      </div>
    );
  }

  if (!gameStarted || !currentTask) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <button
          onClick={() => navigate('/my-appls')}
          className="text-primary hover:underline mb-4"
        >
          ← Назад к заявкам
        </button>
        <div className="text-center py-10">
          <p className="text-lg mb-4">Готовы начать квест?</p>
          <button
            onClick={startGame}
            className="btn-grad px-8 py-3 rounded-lg font-bold text-lg"
          >
            🎮 Начать игру
          </button>
        </div>
      </div>
    );
  }

  if (currentTask.status === 'completed') {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
          <CheckCircle size={80} className="text-green-600 mx-auto mb-4" />
          <h1 className="text-4xl font-bold mb-4">🎉 Поздравляем!</h1>
          <p className="text-2xl mb-2">Вы завершили квест!</p>
          <div className="bg-white p-4 rounded mt-6 space-y-2">
            <div className="flex items-center justify-center gap-3">
              <Trophy className="text-yellow-500" />
              <span className="text-2xl font-bold">{currentTask.totalPoints} очков</span>
            </div>
            <div className="flex items-center justify-center gap-3">
              <Clock className="text-blue-500" />
              <span className="text-xl">{formatTime(currentTask.totalTime || 0)}</span>
            </div>
          </div>
          <button
            onClick={() => navigate('/my-appls')}
            className="mt-6 btn-grad px-6 py-2 rounded"
          >
            Вернуться к заявкам
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <button
        onClick={() => navigate('/my-appls')}
        className="text-primary hover:underline mb-4"
      >
        ← Назад
      </button>

      {/* Заголовок */}
      <div className="bg-primary text-white p-6 rounded-lg mb-6">
        <h1 className="text-3xl font-bold mb-2">{game.title}</h1>
        <div className="flex justify-between items-center">
          <span>Задание {currentTask.currentTaskIndex! + 1} из {currentTask.totalTasks}</span>
          <span className="flex items-center gap-2">
            <Clock size={20} />
            {formatTime(timeElapsed)}
          </span>
        </div>
      </div>

      {/* Прогресс-бар */}
      <div className="mb-6">
        <div className="w-full bg-white/10 rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{
              width: `${((currentTask.currentTaskIndex! + 1) / currentTask.totalTasks!) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Задание */}
      <div className="glass p-8 mb-6">
        <h2 className="text-2xl font-bold mb-4">{currentTask.task?.title}</h2>

        <div
          className="rich-content mb-6 rounded bg-white/[0.03] p-4 text-zinc-300"
          dangerouslySetInnerHTML={{
            __html: currentTask.task?.description || '',
          }}
        />

        {currentTask.task?.hints && currentTask.task.hints.length > 0 ? (
          <details className="mb-6 cursor-pointer">
            <summary className="font-bold text-violet-400">💡 Подсказки</summary>
            <ul className="list-disc list-inside mt-2 ml-2 space-y-1">
              {currentTask.task.hints.map((hint, idx) => (
                <li key={idx} className="text-zinc-300">
                  {typeof hint === 'string' ? hint : hint.text}
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <p className="mb-6 text-sm text-zinc-500">Подсказки появятся позже, если они предусмотрены заданием.</p>
        )}
      </div>

      {/* Обратная связь */}
      {feedback.type && (
        <div
          className={`mb-6 p-4 rounded ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 border border-green-300'
              : 'bg-rose-500/10 border border-rose-500/20 text-rose-300 border border-red-300'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Форма ответа */}
      <form onSubmit={handleSubmitAnswer} className="glass p-8">
        <label className="block font-bold mb-4">Ваш ответ:</label>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Введите ответ..."
          rows={4}
          className="w-full border rounded px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-primary"
          disabled={isSubmitting}
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full btn-grad py-3 rounded font-bold disabled:opacity-50 transition"
        >
          {isSubmitting ? 'Отправка...' : 'Отправить ответ'}
        </button>
      </form>
    </div>
  );
}
