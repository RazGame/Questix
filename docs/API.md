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

Организатор или администратор.

```json
{
  "title": "Night Quest",
  "city": "Saint Petersburg",
  "dateofstart": "2026-06-09T18:05:00.000Z",
  "dateofend": "2026-06-09T20:56:00.000Z",
  "deposit": "500",
  "prize": "1000",
  "description": "Quest description",
  "taskOrderMode": "linear"
}
```

Правила:

- `title` уникален;
- `dateofend` должен быть позже `dateofstart`;
- UI отправляет даты в UTC, выбранные пользователем как локальные;
- `taskOrderMode` - порядок прохождения заданий:
  - `linear` (по умолчанию) - общий порядок для всех команд; командам можно назначить индивидуальное время старта;
  - `random` - каждая команда получает случайный порядок при старте;
  - `manual` - порядок для каждой команды задаёт организатор (`PATCH /appls/:id/settings`).

### PUT `/games/:id`

Администратор или организатор игры (создатель или соорганизатор). Частичное обновление квеста.

### DELETE `/games/:id`

Администратор или организатор игры (создатель или соорганизатор). Удаляет квест и заявки на него.

### POST `/games/:id/organizers`

Администратор или создатель игры. Добавляет соорганизатора по никнейму; пользователь автоматически получает роль `organizer`. У игры может быть несколько организаторов - все они модерируют игру наравне с создателем (правка игры, задания, заявки, логи, публикация).

```json
{
  "nickname": "ivan"
}
```

### DELETE `/games/:id/organizers/:userId`

Администратор или создатель игры. Убирает соорганизатора.

### POST `/games/:id/publish`

Администратор или любой организатор игры. Публикует результаты игры: после этого участники могут смотреть итоговую таблицу и статистику.

### GET `/games/:id/stats`

Auth required. Статистика прохождения игры: таблица команд по заданиям, кто отправил правильный ответ (`submittedBy`), время на задание, итоговое время и место (`place`).

Время команды: `baseTotalTime` - чистое время прохождения, `timeAdjustments` - штрафы/бонусы организаторов с причинами, `totalTime` - итоговое время с учётом корректировок (по нему считаются места).

До публикации доступна только администратору и организаторам игры; после публикации (`published: true`) — всем авторизованным пользователям. В `game.organizers` возвращается список соорганизаторов.

### GET `/games/:id/logs`

Логи действий команд во время игры: старт, каждый отправленный ответ (кто, что, верный/неверный, когда), переходы между заданиями, финиш.

Администратор видит логи всех игр, организатор — только игр, которые создал сам или где он соорганизатор.

## Teams

### POST `/teams`

Auth required. Создаёт команду; создатель автоматически становится капитаном и получает роль `team_captain`. Пользователь может быть капитаном только одной команды.

```json
{
  "name": "Team name"
}
```

### GET `/teams/my-teams`

Auth required. Команды, где пользователь капитан или участник.

### GET `/teams/:teamId`

Auth required. Информация о команде.

### POST `/teams/:teamId/members`

Только капитан. Добавляет участника по `nickname` (или `memberId`).

```json
{
  "nickname": "ivan"
}
```

### DELETE `/teams/:teamId/members/:memberId`

Только капитан. Удаляет участника (капитана удалить нельзя).

### POST `/teams/:teamId/leave`

Auth required. Выход из команды. Капитан не может выйти — сначала нужно передать права.

### POST `/teams/:teamId/transfer-captain`

Только капитан. Передаёт права капитана участнику своей команды.

```json
{
  "newCaptainId": "507f1f77bcf86cd799439011"
}
```

## Applications

### POST `/appls`

Auth required. Поведение зависит от `participation` игры:
- **командный квест** (`team`): заявку подаёт капитан, команда привязывается автоматически;
- **одиночный квест** (`solo`): заявку подаёт сам игрок, команда не нужна (`teamName` = ник игрока).

```json
{
  "gameId": "507f1f77bcf86cd799439011"
}
```

Правила:

- командный квест: подать заявку может только капитан команды; одна команда — одна заявка на квест;
- одиночный квест: одна заявка на пользователя; команда не требуется;
- нельзя подать заявку после `dateofstart`;
- новая заявка получает статус `pending`.

### GET `/appls/my`

Auth required. Возвращает заявки, поданные пользователем, и заявки команд, где он участник, с данными квеста (`dateofstart`, `dateofend`, `deposit`, `prize`, `published`).

### GET `/appls/game/:gameId`

Администратор или организатор игры (создатель или соорганизатор). Возвращает заявки на квест.

### PATCH `/appls/:id/status`

Администратор или организатор игры (создатель или соорганизатор).

```json
{
  "status": "approved"
}
```

Статусы: `pending`, `approved`, `rejected`, `completed`.

### PATCH `/appls/:id/settings`

Администратор или организатор игры. Настройки прохождения для конкретной команды:

```json
{
  "startAt": "2026-06-09T10:05:00.000Z",
  "taskOrder": ["taskId2", "taskId1"]
}
```

- `startAt` - индивидуальное время старта команды (линейный режим): игра стартует в 10:00, команда 1 может приступить в 10:05, вторая в 10:10. `null` - команда стартует вместе со всеми;
- `taskOrder` - ручной порядок заданий (режим `manual`); должен включать каждое задание игры ровно один раз.

## Tasks

### GET `/tasks/game/:gameId`

Возвращает задания квеста, отсортированные по `orderIndex`.

### POST `/tasks/game/:gameId`

Администратор или организатор игры (создатель или соорганизатор).

```json
{
  "title": "Task 1",
  "description": "<h1>Question</h1>",
  "answers": ["answer", "ответ"],
  "hints": ["Hint"],
  "orderIndex": 0,
  "timeLimit": 60
}
```

Очков у заданий нет: победитель определяется по итоговому времени (с учётом штрафов и бонусов).

Ответы хранятся на сервере и не отправляются в endpoint текущего задания.

### GET `/tasks/:taskId`

Возвращает задание по ID.

### PUT `/tasks/:taskId`

Администратор или организатор игры (создатель или соорганизатор). Обновляет задание.

### DELETE `/tasks/:taskId`

Администратор или организатор игры (создатель или соорганизатор). Удаляет задание.

### POST `/tasks/game/:gameId/reorder`

Администратор или организатор игры (создатель или соорганизатор).

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

- начать игру может любой участник команды заявки;
- заявка должна быть `approved` и привязана к команде;
- текущее время должно быть в интервале `[dateofstart, dateofend)`;
- если команде назначено индивидуальное время старта (`startAt`), раньше него стартовать нельзя;
- порядок заданий зависит от `taskOrderMode` игры: линейный, случайный или ручной (заданный организатором);
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

Отправлять ответы могут все участники команды. В прогрессе и логах фиксируется, кто отправил ответ (`submittedBy`). Если любой участник ответил правильно, вся команда переходит на следующее задание.

После `dateofend` ответ не принимается, прогресс незавершённой игры помечается как `abandoned`.

### GET `/progress/:gameApplId`

Auth required. Возвращает прогресс команды (участникам команды или администратору).

### POST `/progress/:gameApplId/adjust-time`

Администратор или организатор игры. Штраф или бонус к итоговому времени команды:

```json
{
  "amount": 120,
  "reason": "Опоздание на точку"
}
```

`amount` - секунды: положительное значение добавляет время (штраф), отрицательное убавляет (бонус). Все корректировки с причинами видны в статистике игры и входят в итоговое время и место команды.

### POST `/progress/:gameApplId/set-order`

Admin only. Назначает порядок заданий для команды.

### GET `/progress/game/:gameId/results`

Администратор или организатор игры (создатель или соорганизатор). Возвращает результаты команд по квесту.

## Music («Угадай мелодию»)

Все `/music/*` REST-маршруты (кроме `GET /music/public/:code`) - для администратора
или организатора. Игроки и экран взаимодействуют через **Socket.IO** (не REST).
В одиночной игре с `auth=open` игроки входят без регистрации (по имени/коду); при
`auth=required` и в командном режиме - по аккаунту (JWT в `handshake.auth.token`).

REST (управление, под auth + organizer):

- `GET /music/games`, `POST /music/games`, `GET|PATCH|DELETE /music/games/:id` - игры (создание ставит `kind=guess_song`, `format=offline`, генерит `code`). `POST`/`PATCH` принимают `participation` (`solo`/`team`) и `auth` (`open`/`required`); командная игра форсит `auth=required`.
- `GET /music/public/:code` - публичная мета по коду (без auth): `{ title, auth, participation }` - страница игрока выбирает вход (логин vs имя).
- `POST|PATCH|DELETE /music/games/:id/blocks[/:blockId]` - блоки песен.
- `POST|PATCH|DELETE /music/games/:id/songs[/:songId]` - песни.
- `POST /music/games/:id/songs/:songId/upload` - ручная загрузка аудиофайла (raw body, `?ext=`).
- `POST /music/games/:id/songs/:songId/download` - повторная авто-загрузка через SpotiFLAC.
- `GET /music/search?q=` - поиск песен (SpotiFLAC).
- `GET /music/net`, `GET /music/qr?text=` - LAN-IP и QR для входа игроков.
- `GET /music/spotiflac/version`, `POST /music/spotiflac/update` - версия и обновление SpotiFLAC.

Socket.IO события:

- игрок: `join {role:'player', code, name, playerId}` (в командной/авторизованной игре имя берётся из профиля, токен — в `handshake.auth.token`), `player:ready`, `player:buzz`, `player:rename`;
- экран: `join {role:'screen', gameId}` (получает команды `cmd`: play/pause/resume/fadeAndStop/stop);
- ведущий (JWT в `handshake.auth.token`): `join {role:'admin', gameId}`, `admin:start|correct|wrong|skip|reset`;
- сервер шлёт `state` (публичное состояние; в командном режиме `mode='team'`, `teams[]`, `buzzed.by`), `joined` (с `teamId`/`teamName`), `song-updated`, `error-msg`.

Аудиофайлы раздаются из `/media/<file>`. Каталог квестов `/games` игры `guess_song` не возвращает.

## Users

### GET `/users`

Admin only. Возвращает пользователей без `hashed_pwd`.

### GET `/users/:id`

Auth required. Возвращает пользователя без `hashed_pwd`.

### PUT `/users/profile`

Auth required. Редактирование собственного профиля: `firstName`, `lastName`, `nickname`, `city`, `phone`. Никнейм проверяется на уникальность.

### PATCH `/users/:id/roles`

Admin only. Назначает роли пользователю.

```json
{
  "roles": ["user", "organizer"]
}
```

Допустимые роли: `user`, `admin`, `organizer`, `team_captain` (последняя обычно выдаётся автоматически при создании команды).

## Ошибки

- `400` - неверные данные или бизнес-правило нарушено;
- `401` - нет или неверный JWT;
- `403` - недостаточно прав;
- `404` - ресурс не найден;
- `409` - конфликт, например дублирующий `title`;
- `500` - ошибка сервера.
