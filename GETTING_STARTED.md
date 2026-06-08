# Getting Started

Этот гайд описывает актуальный локальный запуск и ручную проверку Questix.

## 1. Запуск Через Docker

Создайте локальный `.env`:

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

Запустите сервисы:

```bash
docker compose up -d --build
```

Проверьте:

```bash
docker compose ps
```

Адреса:

- Frontend: http://localhost:5173
- Backend: http://localhost:5000
- Swagger: http://localhost:5000/api-docs

## 2. Локальная Разработка

Можно поднять только MongoDB:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Backend:

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Frontend:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

## 3. Создание Админа

1. Зарегистрируйте пользователя на http://localhost:5173/signup.
2. Откройте MongoDB shell:

```bash
docker exec -it quest-mongodb mongosh -u admin -p password --authenticationDatabase admin quest
```

Если вы поменяли значения в `.env`, используйте свои `MONGO_INITDB_ROOT_USERNAME` и `MONGO_INITDB_ROOT_PASSWORD`.

3. Назначьте роль:

```javascript
db.users.updateOne(
  { username: "your-email@example.com" },
  { $set: { roles: ["user", "admin"] } }
)
```

4. Выйдите и войдите снова в приложении.

## 4. Проверка Основного Сценария

### Админ

1. Откройте `/admin`.
2. Создайте квест:
   - дата начала должна быть в будущем, если хотите проверить подачу заявки;
   - дата окончания должна быть позже даты начала.
3. Нажмите шестерёнку у квеста.
4. На `/admin/game/:gameId/tasks` создайте задания.
5. Когда появится заявка, смените статус на `Одобрено`.

### Участник

1. Откройте `/games`.
2. Во вкладке `Предстоящие` выберите квест.
3. Подайте заявку до старта квеста.
4. После одобрения и наступления времени старта откройте `/my-appls`.
5. Нажмите `Войти в игру`.

## 5. Правила Дат

- В UI даты вводятся как локальные.
- В API и MongoDB даты хранятся как UTC.
- Заявки закрываются в момент `dateofstart`.
- Игра доступна только в интервале `[dateofstart, dateofend)`.
- После окончания ответы больше не принимаются.

## 6. Troubleshooting

Логи:

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f mongodb
```

Пересборка:

```bash
docker compose up -d --build
```

Полный сброс контейнеров и данных:

```bash
docker compose down -v
docker compose up -d --build
```

Если роль `admin` не появилась, перелогиньтесь: роли лежат в JWT.
