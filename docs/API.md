# API

Base URL:

```text
http://localhost:5000
```

Swagger UI:

```text
http://localhost:5000/api-docs
```

Защищённые endpoints требуют заголовок:

```http
Authorization: Bearer <token>
```

## Auth

### POST `/auth/signup`

```json
{
  "firstName": "Ivan",
  "lastName": "Petrov",
  "nickname": "ivan",
  "username": "ivan@example.com",
  "city": "Moscow",
  "phone": "+79990000000",
  "hashed_pwd": "password123"
}
```

Возвращает JWT и пользователя с `roles`.

### POST `/auth/login`

```json
{
  "username": "ivan@example.com",
  "hashed_pwd": "password123"
}
```

### GET `/auth/profile`

Требует JWT.

## Games

### GET `/games`

Возвращает все квесты.

### GET `/games/:id`

Возвращает квест по ID.

### POST `/games`

Admin only.

```json
{
  "title": "Night Quest",
  "city": "Saint Petersburg",
  "dateofstart": "2026-06-09T18:05:00.000Z",
  "dateofend": "2026-06-09T20:56:00.000Z",
  "deposit": "500",
  "prize": "1000",
  "description": "Quest description"
}
```

Правила:

- `title` уникален;
- `dateofend` должен быть позже `dateofstart`;
- UI отправляет даты в UTC, выбранные пользователем как локальные.

### PUT `/games/:id`

Admin only. Частичное обновление квеста.

### DELETE `/games/:id`

Admin only. Удаляет квест и заявки на него.

## Applications

### POST `/appls`

Auth required.

```json
{
  "gameId": "507f1f77bcf86cd799439011",
  "teamName": "Team name",
  "teamMembers": ["Member 1", "Member 2"]
}
```

Правила:

- нельзя подать заявку повторно на тот же квест;
- нельзя подать заявку после `dateofstart`;
- новая заявка получает статус `pending`.

### GET `/appls/my`

Auth required. Возвращает заявки текущего пользователя с данными квеста, включая `dateofstart`, `dateofend`, `deposit`, `prize`.

### GET `/appls/game/:gameId`

Admin only. Возвращает заявки на квест.

### PATCH `/appls/:id/status`

Admin only.

```json
{
  "status": "approved"
}
```

Статусы: `pending`, `approved`, `rejected`, `completed`.

## Tasks

### GET `/tasks/game/:gameId`

Возвращает задания квеста, отсортированные по `orderIndex`.

### POST `/tasks/game/:gameId`

Admin only.

```json
{
  "title": "Task 1",
  "description": "<h1>Question</h1>",
  "answers": ["answer", "ответ"],
  "hints": ["Hint"],
  "orderIndex": 0,
  "timeLimit": 60,
  "points": 10
}
```

Ответы хранятся на сервере и не отправляются в endpoint текущего задания.

### GET `/tasks/:taskId`

Возвращает задание по ID.

### PUT `/tasks/:taskId`

Admin only. Обновляет задание.

### DELETE `/tasks/:taskId`

Admin only. Удаляет задание.

### POST `/tasks/game/:gameId/reorder`

Admin only.

```json
{
  "taskIds": ["taskId1", "taskId2"]
}
```

## Progress

### POST `/progress/start`

Auth required.

```json
{
  "gameApplId": "507f1f77bcf86cd799439012"
}
```

Правила:

- заявка должна принадлежать текущему пользователю;
- заявка должна быть `approved`;
- текущее время должно быть в интервале `[dateofstart, dateofend)`;
- в квесте должно быть хотя бы одно задание.

### GET `/progress/:gameApplId/current-task`

Auth required. Возвращает текущее задание без правильных ответов.

После `dateofend` возвращает ошибку для незавершённой игры. Если команда уже завершила все задания, endpoint возвращает итоговый статус `completed`.

### POST `/progress/:gameApplId/submit-answer`

Auth required.

```json
{
  "answer": "answer"
}
```

После `dateofend` ответ не принимается, прогресс незавершённой игры помечается как `abandoned`.

### GET `/progress/:gameApplId`

Auth required. Возвращает прогресс команды.

### POST `/progress/:gameApplId/set-order`

Admin only. Назначает порядок заданий для команды.

### GET `/progress/game/:gameId/results`

Admin only. Возвращает результаты команд по квесту.

## Users

### GET `/users`

Admin only. Возвращает пользователей без `hashed_pwd`.

### GET `/users/:id`

Auth required. Возвращает пользователя без `hashed_pwd`.

## Ошибки

- `400` - неверные данные или бизнес-правило нарушено;
- `401` - нет или неверный JWT;
- `403` - недостаточно прав;
- `404` - ресурс не найден;
- `409` - конфликт, например дублирующий `title`;
- `500` - ошибка сервера.
