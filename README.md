# Questix

Веб-приложение для организации квестов: пользователи регистрируются, смотрят предстоящие квесты, подают заявки до старта, проходят задания после одобрения, а администратор управляет квестами, заявками, заданиями и результатами.

## Стек

- Backend: Node.js, Express, TypeScript, MongoDB, Mongoose, JWT, bcryptjs, Swagger.
- Frontend: React 18, TypeScript, Vite, TailwindCSS, Zustand, React Router, Axios.
- DevOps: Docker Compose.

## Быстрый Старт

1. Создайте локальный `.env` из примера:

```bash
cp .env.example .env
```

На Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

2. Запустите проект:

```bash
docker compose up -d --build
```

3. Откройте:

- Frontend: http://localhost:5173
- Backend: http://localhost:5000
- Swagger: http://localhost:5000/api-docs

## Первый Админ

1. Зарегистрируйте пользователя на http://localhost:5173/signup.
2. Назначьте ему роль `admin` в MongoDB:

```bash
docker exec quest-mongodb mongosh -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin quest
```

В `mongosh`:

```javascript
db.users.updateOne(
  { username: "your-email@example.com" },
  { $set: { roles: ["user", "admin"] } }
)
```

После изменения роли выйдите и войдите заново, чтобы обновился JWT.

## Основной Сценарий

1. Админ открывает `/admin`, создаёт квест с датой начала и окончания.
2. Админ открывает настройки квеста через шестерёнку и добавляет задания.
3. Пользователь открывает `/games`, выбирает предстоящий квест и подаёт заявку до времени старта.
4. Админ одобряет заявку на `/admin`.
5. Когда квест активен, пользователь открывает `/my-appls` или вкладку `Мои активные квесты` на `/games` и входит в игру.
6. После окончания квеста новые заявки, старт игры и отправка ответов закрываются, а завершённые команды могут открыть итоговый результат.

## Важные Правила Времени

- Даты вводятся в локальном часовом поясе браузера и сохраняются в MongoDB как UTC.
- Подать заявку можно только до `dateofstart`.
- Войти в игру можно только при approved-заявке и в интервале `[dateofstart, dateofend)`.
- После `dateofend` получение задания и отправка ответа блокируются для незавершённых прохождений.
- Завершённый прогресс остаётся доступен после `dateofend`, чтобы показать результат.

## Маршруты Frontend

| Путь | Доступ | Назначение |
| --- | --- | --- |
| `/` | все | Главная |
| `/login` | гости | Вход |
| `/signup` | гости | Регистрация |
| `/games` | все | Каталог: мои активные, предстоящие, завершённые |
| `/games/:id` | все | Детали квеста и подача заявки |
| `/my-appls` | auth | Мои заявки и вход в игру |
| `/game/:gameId/play/:gameApplId` | auth | Прохождение квеста |
| `/admin` | admin | Квесты, заявки, результаты |
| `/admin/game/:gameId/tasks` | admin | Задания квеста |

## Документация

- [GETTING_STARTED.md](GETTING_STARTED.md) - пошаговый запуск и ручная проверка.
- [docs/API.md](docs/API.md) - REST API.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - структура и модели.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - Docker, env, backup.
- [backend/README.md](backend/README.md) - backend.
- [frontend/README.md](frontend/README.md) - frontend.

## Команды

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose down
docker compose up -d --build
```

## Что Не Коммитить

Не коммитьте `.env`, `.env.local`, `node_modules`, `dist`, `build`, `coverage` и логи. Коммитьте только `.env.example`.
