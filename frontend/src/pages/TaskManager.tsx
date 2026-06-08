import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { taskService } from '../services/tasks';
import { Task } from '../types';
import { Edit2, Trash2, Plus } from 'lucide-react';

export default function TaskManager() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    answers: '',
    hints: '',
    orderIndex: 0,
    timeLimit: '',
    points: 10,
  });

  useEffect(() => {
    loadTasks();
  }, [gameId]);

  const loadTasks = async () => {
    try {
      setIsLoading(true);
      if (gameId) {
        const data = await taskService.getGameTasks(gameId);
        setTasks(Array.isArray(data) ? data : []);
      } else {
        setError('Квест не выбран');
      }
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
        answers: formData.answers.split('\n').filter(a => a.trim()),
        hints: formData.hints.split('\n').filter(h => h.trim()),
        orderIndex: formData.orderIndex,
        timeLimit: formData.timeLimit ? parseInt(formData.timeLimit) : undefined,
        points: formData.points,
      };

      if (editingTask) {
        await taskService.updateTask(editingTask._id, taskData as any);
        setEditingTask(null);
      } else {
        await taskService.createTask(gameId!, taskData as any);
      }

      setFormData({
        title: '',
        description: '',
        answers: '',
        hints: '',
        orderIndex: 0,
        timeLimit: '',
        points: 10,
      });
      setShowForm(false);
      loadTasks();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка сохранения задания');
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
      answers: task.answers.join('\n'),
      hints: task.hints?.join('\n') || '',
      orderIndex: task.orderIndex,
      timeLimit: task.timeLimit?.toString() || '',
      points: task.points || 10,
    });
    setShowForm(true);
  };

  if (isLoading) {
    return <div className="text-center py-10">Загружается...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-4">
      <button
        onClick={() => navigate('/admin')}
        className="text-primary hover:underline mb-4"
      >
        ← Назад в админку
      </button>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold">Управление заданиями</h2>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditingTask(null);
            setFormData({
              title: '',
              description: '',
              answers: '',
              hints: '',
              orderIndex: tasks.length,
              timeLimit: '',
              points: 10,
            });
          }}
          className="bg-primary text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-opacity-90"
        >
          <Plus size={20} /> Новое задание
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow mb-6">
          <div className="space-y-4">
            <div>
              <label className="block font-bold mb-2">Название задания</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="block font-bold mb-2">Описание (HTML контент)</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                required
                rows={6}
                className="w-full border rounded px-3 py-2 font-mono"
                placeholder="<h1>Загадка</h1><p>Текст загадки...</p>"
              />
              <small className="text-gray-600">
                Можно использовать HTML: &lt;h1&gt;, &lt;p&gt;, &lt;img&gt;, &lt;strong&gt; и т.д.
              </small>
            </div>

            <div>
              <label className="block font-bold mb-2">Правильные ответы (по одному на строку)</label>
              <textarea
                value={formData.answers}
                onChange={(e) => setFormData({ ...formData, answers: e.target.value })}
                required
                rows={4}
                className="w-full border rounded px-3 py-2"
                placeholder="Ответ 1&#10;Ответ 2&#10;Ответ 3"
              />
            </div>

            <div>
              <label className="block font-bold mb-2">Подсказки (опционально, по одному на строку)</label>
              <textarea
                value={formData.hints}
                onChange={(e) => setFormData({ ...formData, hints: e.target.value })}
                rows={3}
                className="w-full border rounded px-3 py-2"
                placeholder="Подсказка 1&#10;Подсказка 2"
              />
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block font-bold mb-2">Порядок</label>
                <input
                  type="number"
                  value={formData.orderIndex}
                  onChange={(e) =>
                    setFormData({ ...formData, orderIndex: parseInt(e.target.value) })
                  }
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block font-bold mb-2">Лимит времени (сек)</label>
                <input
                  type="number"
                  value={formData.timeLimit}
                  onChange={(e) => setFormData({ ...formData, timeLimit: e.target.value })}
                  placeholder="Без лимита"
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block font-bold mb-2">Очки</label>
                <input
                  type="number"
                  value={formData.points}
                  onChange={(e) =>
                    setFormData({ ...formData, points: parseInt(e.target.value) })
                  }
                  className="w-full border rounded px-3 py-2"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <button
                type="submit"
                className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700"
              >
                {editingTask ? 'Обновить' : 'Создать'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingTask(null);
                }}
                className="bg-gray-400 text-white px-6 py-2 rounded hover:bg-gray-500"
              >
                Отмена
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {tasks.length === 0 ? (
          <p className="text-gray-600 text-center py-8">Заданий еще нет. Создайте первое!</p>
        ) : (
          tasks.map((task) => (
            <div key={task._id} className="bg-white p-4 rounded-lg shadow">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="bg-primary text-white px-3 py-1 rounded-full text-sm font-bold">
                      #{task.orderIndex + 1}
                    </span>
                    <h3 className="text-xl font-bold">{task.title}</h3>
                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                      {task.points} очков
                    </span>
                  </div>

                  <div className="text-gray-600 mb-2">
                    <strong>Ответы:</strong> {task.answers.join(', ')}
                  </div>

                  <div className="text-sm text-gray-500">
                    {task.hints && task.hints.length > 0 && (
                      <p><strong>Подсказки:</strong> {task.hints.length}</p>
                    )}
                    {task.timeLimit && (
                      <p><strong>Лимит времени:</strong> {task.timeLimit} сек</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(task)}
                    className="text-blue-600 hover:text-blue-800 p-2"
                  >
                    <Edit2 size={20} />
                  </button>
                  <button
                    onClick={() => handleDelete(task._id)}
                    className="text-red-600 hover:text-red-800 p-2"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
