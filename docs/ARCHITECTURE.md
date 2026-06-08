# Архитектура

## Обзор

```text
frontend/ React + Vite
    ↓ HTTP JSON + JWT
backend/ Express + TypeScript
    ↓ Mongoose
MongoDB
```

## Backend

```text
backend/src/
├── config/        # env и MongoDB connection
├── controllers/   # бизнес-логика
├── middleware/    # auth/admin middleware
├── models/        # Mongoose-модели
├── routes/        # Express routes + Swagger comments
├── services/      # общие бизнес-правила
├── types/         # TypeScript interfaces
├── utils/         # password/JWT helpers
└── index.ts       # Express app
```

Главные модели:

- `User` - профиль, `roles`, ссылки на заявки.
- `Game` - квест, даты начала/окончания, приз, депозит, заявки.
- `GameAppl` - заявка команды на квест.
- `Task` - задание квеста, ответы, подсказки, очки.
- `GameTeamProgress` - прохождение квеста командой.

## Frontend

```text
frontend/src/
├── components/    # Navbar, PrivateRoute, ErrorBoundary
├── pages/         # экраны приложения
├── services/      # Axios API wrappers
├── store/         # Zustand auth state
├── types/         # frontend-типы
├── utils/         # date helpers
├── App.tsx        # router
└── index.tsx
```

## Роли

`roles` хранится как массив строк:

```json
["user", "admin"]
```

Проверка admin-доступа выполняется на backend middleware и на frontend route guard.

## Даты

UI использует `datetime-local`, то есть вводит дату без timezone. Перед отправкой frontend конвертирует значение в ISO UTC через `new Date(value).toISOString()`.

Состояние квеста:

- `scheduled`: текущее время меньше `dateofstart`;
- `active`: текущее время в `[dateofstart, dateofend)`;
- `finished`: текущее время больше или равно `dateofend`.

Backend применяет эти правила через `backend/src/services/questState.ts`, чтобы контроллеры не дублировали сравнения дат:

- заявка закрывается после `dateofstart`;
- старт игры возможен только для approved-заявки в активном окне;
- получение задания и отправка ответа закрываются после `dateofend`;
- завершённый прогресс можно открыть после `dateofend`, чтобы показать результат.

## Основные Потоки

### Подача заявки

1. Пользователь выбирает предстоящий квест на `/games`.
2. Frontend вызывает `POST /appls`.
3. Backend проверяет, что квест ещё не начался и заявки-дубликата нет.
4. Создаётся `GameAppl` со статусом `pending`.

### Одобрение заявки

1. Admin выбирает квест на `/admin`.
2. Меняет статус заявки через `PATCH /appls/:id/status`.
3. Пользователь видит approved-заявку на `/my-appls`.

### Прохождение

1. Пользователь открывает `/game/:gameId/play/:gameApplId`.
2. Frontend вызывает `POST /progress/start`.
3. Backend создаёт `GameTeamProgress` или возвращает существующий.
4. Frontend получает текущее задание через `/current-task`.
5. Ответ отправляется через `/submit-answer`.
6. После последнего задания прогресс становится `completed`.

## Безопасность

- Пароль хешируется bcryptjs на backend.
- JWT хранит `id`, `username`, `roles`.
- Ответы заданий не отправляются в endpoint текущего задания.
- `hashed_pwd` не возвращается из user endpoints.
- Секреты должны храниться в `.env`, не в репозитории.
