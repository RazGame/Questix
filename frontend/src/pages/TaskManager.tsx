import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { taskService } from '../services/tasks';
import { Task, TaskHint } from '../types';
import { Edit2, Plus, Trash2, X } from 'lucide-react';
import RichTextEditor from '../components/RichTextEditor';

interface TaskFormData {
  title: string;
  description: string;
  answers: string[];
  hints: TaskHint[];
  orderIndex: number;
  timeLimit: string;
  points: number;
}

const emptyForm = (orderIndex = 0): TaskFormData => ({
  title: '',
  description: '',
  answers: [''],
  hints: [],
  orderIndex,
  timeLimit: '',
  points: 10,
});

const normalizeHints = (hints: Task['hints'] = []): TaskHint[] =>
  hints.map((hint) =>
    typeof hint === 'string'
      ? { text: hint, delayMinutes: 0 }
      : { text: hint.text, delayMinutes: hint.delayMinutes || 0 }
  );

export default function TaskManager() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<TaskFormData>(emptyForm());

  useEffect(() => {
    loadTasks();
  }, [gameId]);

  const loadTasks = async () => {
    try {
      setIsLoading(true);
      if (!gameId) {
        setError('Квест не выбран');
        return;
      }

      const data = await taskService.getGameTasks(gameId);
      setTasks(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка загрузки заданий');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const taskData = {
        title: formData.title,
        description: formData.description,
        answers: formData.answers.map((answer) => answer.trim()).filter(Boolean),
        hints: formData.hints
          .map((hint) => ({
            text: hint.text.trim(),
            delayMinutes: Math.max(0, Number(hint.delayMinutes) || 0),
          }))
          .filter((hint) => hint.text),
        orderIndex: formData.orderIndex,
        timeLimit: formData.timeLimit ? parseInt(formData.timeLimit, 10) : undefined,
        points: formData.points,
      };

      if (taskData.answers.length === 0) {
        setError('Добавьте хотя бы один правильный ответ');
        return;
      }

      if (editingTask) {
        await taskService.updateTask(editingTask._id, taskData as any);
        setEditingTask(null);
      } else {
        await taskService.createTask(gameId!, taskData as any);
      }

      setFormData(emptyForm(tasks.length));
      setShowForm(false);
      setError('');
      loadTasks();
    } catch (err: any) {
      setError(
        err.response?.data?.errors?.[0] ||
          err.response?.data?.error ||
          'Ошибка сохранения задания'
      );
    }
  };

  const handleDelete = async (taskId: string) => {
    if (window.confirm('Удалить это задание?')) {
      try {
        await taskService.deleteTask(taskId);
        loadTasks();
      } catch (err: any) {
        setError('Ошибка удаления задания');
      }
    }
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description,
      answers: task.answers.length ? task.answers : [''],
      hints: normalizeHints(task.hints),
      orderIndex: task.orderIndex,
      timeLimit: task.timeLimit?.toString() || '',
      points: task.points || 10,
    });
    setShowForm(true);
  };

  const updateAnswer = (index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      answers: prev.answers.map((answer, i) => (i === index ? value : answer)),
    }));
  };

  const removeAnswer = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      answers: prev.answers.filter((_, i) => i !== index),
    }));
  };

  const updateHint = (index: number, patch: Partial<TaskHint>) => {
    setFormData((prev) => ({
      ...prev,
      hints: prev.hints.map((hint, i) => (i === index ? { ...hint, ...patch } : hint)),
    }));
  };

  const removeHint = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      hints: prev.hints.filter((_, i) => i !== index),
    }));
  };

  if (isLoading) {
    return <div className="text-center py-10">Загружается...</div>;
  }

  return (
    <div className="mx-auto max-w-7xl p-4 py-8">
      <button
        onClick={() => navigate('/admin')}
        className="mb-4 text-primary hover:underline"
      >
        ← Назад в админку
      </button>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Управление заданиями</h1>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditingTask(null);
            setFormData(emptyForm(tasks.length));
          }}
          className="btn-grad flex items-center gap-2 rounded-lg px-4 py-2"
        >
          <Plus size={20} /> Новое задание
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-rose-500/20 bg-rose-500/10 p-3 text-rose-300">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="glass mb-6 p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-bold">
              {editingTask ? 'Редактирование задания' : 'Новое задание'}
            </h2>
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-5 py-2 font-bold text-white transition hover:bg-emerald-500"
              >
                {editingTask ? 'Обновить' : 'Создать'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingTask(null);
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-5 py-2 font-bold text-zinc-200 transition hover:bg-white/10"
              >
                Отмена
              </button>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(20rem,25rem)_1fr]">
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-zinc-400">Название задания</span>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  className="input-dark"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-zinc-400">Порядок</span>
                  <input
                    type="number"
                    value={formData.orderIndex}
                    onChange={(e) =>
                      setFormData({ ...formData, orderIndex: parseInt(e.target.value, 10) || 0 })
                    }
                    className="input-dark"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-zinc-400">Лимит времени, сек</span>
                  <input
                    type="number"
                    value={formData.timeLimit}
                    onChange={(e) => setFormData({ ...formData, timeLimit: e.target.value })}
                    placeholder="Без лимита"
                    className="input-dark"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-zinc-400">Очки</span>
                  <input
                    type="number"
                    value={formData.points}
                    onChange={(e) =>
                      setFormData({ ...formData, points: parseInt(e.target.value, 10) || 0 })
                    }
                    className="input-dark"
                  />
                </label>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-400">Правильные ответы</span>
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, answers: [...prev.answers, ''] }))}
                    className="rounded-md bg-white/10 px-2 py-1 text-xs font-bold text-zinc-200 hover:bg-white/20"
                  >
                    Добавить
                  </button>
                </div>
                <div className="space-y-2">
                  {formData.answers.map((answer, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={answer}
                        onChange={(e) => updateAnswer(index, e.target.value)}
                        placeholder={`Ответ ${index + 1}`}
                        className="input-dark text-sm"
                      />
                      {formData.answers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeAnswer(index)}
                          className="rounded-lg bg-white/10 px-3 text-zinc-300 hover:bg-white/20"
                          title="Удалить ответ"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-400">Подсказки</span>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        hints: [...prev.hints, { text: '', delayMinutes: 0 }],
                      }))
                    }
                    className="rounded-md bg-white/10 px-2 py-1 text-xs font-bold text-zinc-200 hover:bg-white/20"
                  >
                    Добавить
                  </button>
                </div>
                <div className="space-y-2">
                  {formData.hints.map((hint, index) => (
                    <div key={index} className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2 sm:grid-cols-[1fr_8rem_auto]">
                      <input
                        type="text"
                        value={hint.text}
                        onChange={(e) => updateHint(index, { text: e.target.value })}
                        placeholder={`Подсказка ${index + 1}`}
                        className="input-dark text-sm"
                      />
                      <input
                        type="number"
                        min={0}
                        value={hint.delayMinutes || 0}
                        onChange={(e) =>
                          updateHint(index, { delayMinutes: parseInt(e.target.value, 10) || 0 })
                        }
                        className="input-dark text-sm"
                        title="Через сколько минут показать"
                      />
                      <button
                        type="button"
                        onClick={() => removeHint(index)}
                        className="rounded-lg bg-white/10 px-3 text-zinc-300 hover:bg-white/20"
                        title="Удалить подсказку"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-zinc-400">Описание</span>
              <RichTextEditor
                value={formData.description}
                onChange={(description) => setFormData({ ...formData, description })}
              />
            </label>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {tasks.length === 0 ? (
          <p className="py-8 text-center text-zinc-400">Заданий еще нет. Создайте первое.</p>
        ) : (
          tasks.map((task) => {
            const hints = normalizeHints(task.hints);

            return (
              <div key={task._id} className="glass p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-primary px-3 py-1 text-sm font-bold text-white">
                        #{task.orderIndex + 1}
                      </span>
                      <h3 className="text-xl font-bold text-zinc-100">{task.title}</h3>
                      <span className="rounded bg-emerald-400/10 px-2 py-1 text-xs text-emerald-300">
                        {task.points || 10} очков
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm text-zinc-400">
                      <span>Ответов: {task.answers.length}</span>
                      <span>Подсказок: {hints.length}</span>
                      {task.timeLimit && <span>Лимит: {task.timeLimit} сек</span>}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(task)}
                      className="p-2 text-violet-400 hover:text-violet-300"
                      title="Редактировать"
                    >
                      <Edit2 size={20} />
                    </button>
                    <button
                      onClick={() => handleDelete(task._id)}
                      className="p-2 text-rose-400 hover:text-rose-300"
                      title="Удалить"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
