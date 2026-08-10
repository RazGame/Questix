# План развития Questix

Пошаговый план эволюции платформы: от локального монолита к модульной
платформе party-игр с облачным ядром и локальными станциями.

Документ написан так, чтобы по нему можно было идти шаг за шагом без
дополнительного контекста. Текущее устройство кода — в [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 0. Правила работы (прочитать перед любым этапом)

### Окружение

На машине разработки **нет Node.js** — всё гоняется через Docker:

```bash
# тайпчек backend (из корня репозитория, Git Bash)
MSYS_NO_PATHCONV=1 docker run --rm -v "D:/Projects/quest-modern/backend:/app" -w /app node:20 \
  node ./node_modules/typescript/bin/tsc --noEmit

# тайпчек frontend
MSYS_NO_PATHCONV=1 docker run --rm -v "D:/Projects/quest-modern/frontend:/app" -w /app node:20 \
  node ./node_modules/typescript/bin/tsc --noEmit

# установка npm-пакета (пример для backend)
MSYS_NO_PATHCONV=1 docker run --rm -v "D:/Projects/quest-modern/backend:/app" -w /app node:20 \
  npm install <package> --save

# пересборка и перезапуск
MSYS_NO_PATHCONV=1 docker compose up -d --build
```

### Регресс-чеклист (выполнять после КАЖДОГО этапа)

1. Оба тайпчека зелёные.
2. `docker compose up -d --build` собирается без ошибок.
3. E2E-тесты против запущенного стека:

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd):/app" -w /app \
  -e NODE_PATH=/app/frontend/node_modules \
  -e MUSIC_TEST_BASE=http://host.docker.internal:5000 \
  --add-host=host.docker.internal:host-gateway node:20 \
  sh -c "node tests/music-flow-test.cjs && node tests/team-guess-song-test.cjs"
```

Ожидается: `RESULT: N passed, 0 failed` в обоих. Если тесты требуют
пользователя `design_org@t.io / password1` с ролью organizer — создать
через `/auth/signup` и выдать роль в Mongo (см. GETTING_STARTED.md).

4. Ручной смоук: создать музыкальную игру в админке, добавить песню,
   открыть пульт + экран, запустить, нажать баззер с телефона/второй вкладки.

### Железные правила

- **Счёт «Угадай мелодию» живёт в памяти бэкенда.** Перезапуск/пересборка
  контейнера убивает активную сессию. Никогда не деплоить во время игры.
- Каждый этап — отдельная ветка + коммит. Не смешивать этапы.
- Не начинать этап N+1, пока регресс-чеклист этапа N не зелёный.
- Этапы 7 и 8 не начинать «впрок» — см. их предусловия.

---

## Целевая картина

```text
            ОБЛАКО (VPS, HTTPS)                ЛОКАЛЬНАЯ СТАНЦИЯ (ноутбук в зале)
┌────────────────────────────────┐          ┌──────────────────────────────────┐
│ core: аккаунты, команды,       │          │ core (тот же код, MODE=station)  │
│ каталог, вход по коду, роли    │          │ modules/guess-song: realtime,    │
│ modules/quest  (онлайн-квесты) │          │   аудио, экран, баззеры          │
│ modules/quiz   (будущее)       │          │ работает полностью офлайн        │
└────────────────────────────────┘          └──────────────────────────────────┘
        │   bundle: игра + mp3 (zip, ДО вечеринки)      ▲
        └───────────────────────────────────────────────┘
        ┌───────────────────────────────────────────────┐
        │   results.json (ПОСЛЕ вечеринки, идемпотентно) ▼
```

Принципы:

1. **Модульный монолит, не микросервисы.** Один репозиторий, один деплой,
   модули = папки с жёсткими границами + реестр.
2. **Односторонний обмен облако↔станция.** Контент вниз до игры, результаты
   вверх после. Во время игры связь не нужна. Двусторонней синхронизации нет.
3. **Реалтайм принадлежит модулю игры**, ядро им не занимается.
4. Новая игра = новая папка в `modules/` + строчка в реестре.

---

## Этап 1. Bundle: экспорт/импорт игры «Угадай мелодию»

**Зачем:** бэкап готовых игр (сейчас они живут только в docker-томах одной
машины), перенос между машинами, будущий транспорт «облако → станция».

**Шаги:**

1. `backend`: установить `adm-zip` и `@types/adm-zip`.
2. Новый файл `backend/src/services/musicBundle.ts`:
   - `exportGame(gameId): Buffer` — zip со структурой:
     ```text
     manifest.json   # { version: 1, exportedAt, game: { title, participation, auth,
                     #   blocks: [{ name, songs: [{ title, artist, album, cover,
                     #   duration, startSec, endSec, sourceUrl, fileName }] }] } }
     media/<fileName>  # аудиофайлы из MEDIA_DIR (у Song поле file)
     ```
     Внутрь кладутся только песни со `status === 'ready'`.
   - `importGame(zipBuffer, userId): Game` — создаёт НОВУЮ игру
     (новые `_id`, новый `code` через `generateJoinCode()`), пишет аудио в
     `MEDIA_DIR` под именами `<новыйSongId><ext>`, создаёт Song-документы
     со `status: 'ready'`. Валидация: `manifest.version === 1`, размер zip
     ≤ 2 ГБ, расширения файлов только аудио.
3. Роуты в `backend/src/routes/music.ts` (оба под auth + модерация):
   - `GET  /music/games/:id/export` → `Content-Type: application/zip`,
     `Content-Disposition: attachment; filename="<code>.questix.zip"`.
   - `POST /music/games/import` (raw body, limit 2gb) → `{ game }`.
4. Фронт (`frontend/src/pages/MusicAdmin.tsx` + `services/music.ts`):
   кнопка «Скачать игру» у выбранной игры (обычная ссылка на export-роут
   с токеном в query или скачивание через axios blob), кнопка
   «Импортировать игру» рядом с «+» (file input → POST).

**Проверка:** экспортировать игру с 2+ песнями → удалить её → импортировать
zip → игра играется от старта до финала (смоук из чеклиста).

**Готово когда:** экспорт→импорт даёт играбельную копию; регресс зелёный.

---

## Этап 2. Модульный монолит: `core/` + `modules/` + реестр

**Зачем:** прочертить границы, чтобы новые игры добавлялись папкой, а не
правками по всему коду. Поведение НЕ меняется — это перекладка.

**Шаги (backend):**

1. Создать структуру (файлы двигать `git mv`, импорты чинить по компилятору):
   ```text
   backend/src/core/     # auth, user, team, gamePermissions, media, jwt,
                         # config, database, validation — всё общее
   backend/src/modules/quest/       # controllers/models/routes квестов:
                                    # game(квест-части), task, gameProgress, gameAppl
   backend/src/modules/guess-song/  # music*, musicSession, musicStore,
                                    # sockets/music, python, net, Song
   ```
   Модель `Game` остаётся в core (каталог общий, у игры есть `kind`).
2. Новый файл `backend/src/core/moduleRegistry.ts`:
   ```ts
   export interface GameModuleBackend {
     kind: string;                    // 'quest' | 'guess_song'
     router: Router;                  // монтируется на /<mountPath>
     mountPath: string;               // 'games' | 'music'
     registerSockets?: (io: Server) => void;
     offline: boolean;                // умеет ли работать на станции (этап 6)
   }
   export const modules: GameModuleBackend[] = [questModule, guessSongModule];
   ```
3. `index.ts`: вместо ручного `app.use(...)` по каждому игровому роуту —
   цикл по `modules` (core-роуты auth/users/teams монтируются как раньше).
4. Единый вход по коду — новый core-роут `GET /join/:code`:
   ищет игру по коду, отвечает `{ kind, title, auth, participation }`.
   (Существующий `/music/public/:code` оставить как алиас.)

**Шаги (frontend):**

5. Структура:
   ```text
   frontend/src/core/     # Navbar, PrivateRoute, api, authStore, общие типы
   frontend/src/games/quest/       # Games, GameDetail, QuestGame, TaskManager...
   frontend/src/games/guess-song/  # Music*.tsx, services/music.ts
   frontend/src/games/registry.tsx
   ```
6. `registry.tsx`:
   ```tsx
   export interface GameModuleFrontend {
     kind: string;
     title: string;                    // 'Угадай мелодию'
     routes: RouteObject[];            // свои страницы
     AdminEditor?: React.FC;           // вкладка в AdminPanel
     playerPath: (code: string) => string;  // '/m/play?code=' + code
   }
   ```
   `App.tsx` собирает роуты из реестра; `AdminPanel` рисует вкладки из
   реестра; страница «Войти по коду» дергает `GET /join/:code` и редиректит
   на `playerPath` нужного модуля.

**Чего НЕ делать:** не менять логику, не переименовывать эндпоинты
(фронт и тесты ходят на старые пути), не трогать `musicSession`.

**Проверка:** регресс-чеклист. E2E-тесты должны пройти БЕЗ правок —
это доказательство, что API не изменилось.

---

## Этап 3. Права: организатор по типам игр

**Зачем:** «друг ведёт квизы, но не может править квесты». Сейчас роль
`organizer` глобальная; соорганизаторы конкретной игры уже есть
(`game.organizers`, см. `core/gamePermissions.ts`).

**Шаги:**

1. `User`: добавить `organizerOf: { type: [String], default: [] }`
   (`['guess_song']`, `['*']` — все типы).
2. Миграция при старте (в `database.ts` после connect):
   `db.users.updateMany({ roles: 'organizer', organizerOf: { $exists: false } }, { $set: { organizerOf: ['*'] } })`.
3. `gamePermissions.ts`:
   ```ts
   export const canCreateGame = (user, kind) =>
     user.roles.includes('admin') ||
     (user.organizerOf || []).some((k) => k === '*' || k === kind);
   ```
   Применить в создании игр: `modules/quest` (создание квеста) и
   `modules/guess-song` (`createMusicGame`). В `isGameModerator` дополнительно
   проверять kind для «организаторских» прав не нужно — там доступ по
   `createdBy`/`organizers` конкретной игры, это уровень инстанса.
4. `organizerOf` добавить в JWT-payload и в ответы `/auth/login`, `/auth/signup`.
5. Админка (AdminPanel → Пользователи): вместо галочки «organizer» —
   чекбоксы по типам из фронтового реестра (`registry.map(m => m.kind)`) + «все».
6. Эндпоинт назначения ролей (`PATCH /users/:id/roles` или аналог в
   `controllers/user.ts`) научить принимать `organizerOf`.

**Проверка:** пользователь с `organizerOf: ['guess_song']` создаёт угадайку,
но получает 403 при создании квеста; `['*']` может всё; регресс зелёный.

---

## Этап 4. Облако: деплой ядра + RS256

**Зачем:** квесты должны жить онлайн 24/7; общие аккаунты для облака и станции.

**Шаги:**

1. VPS (любой, 2 ГБ RAM достаточно): Docker + docker compose, домен,
   HTTPS через Caddy или nginx+certbot (Caddy проще: 10 строк конфига,
   автосертификаты). Reverse-proxy: `/` → frontend:5173, `/api` → backend:5000
   ИЛИ два поддомена (`questix.example.com`, `api.questix.example.com`).
   ВАЖНО: Socket.IO требует проксирования WebSocket (`Upgrade`-заголовки;
   Caddy делает сам).
2. `frontend`: адреса API/сокета берутся из `VITE_SOCKET_URL` и текущего
   origin — проверить `services/api.ts` и `services/socket.ts`, чтобы в
   облачной сборке использовался HTTPS-домен (build-arg).
3. Бэкапы: `mongodump` по крону в файл + копия вне VPS (простого скрипта
   в кроне достаточно).
4. **RS256** (вместо симметричного `JWT_SECRET`):
   - сгенерировать пару: `openssl genrsa -out jwt.key 2048 && openssl rsa -in jwt.key -pubout -out jwt.pub`;
   - `backend/src/utils/jwt.ts`: `sign(..., privateKey, { algorithm: 'RS256' })`,
     `verify(..., publicKey, { algorithms: ['RS256'] })`;
   - env: `JWT_PRIVATE_KEY_FILE`, `JWT_PUBLIC_KEY_FILE` (в compose — тома);
   - станции достаточно ПУБЛИЧНОГО ключа: она проверяет облачные токены,
     не умея их подделывать. Приватный ключ живёт только в облаке.
   - Миграция: старые HS256-токены перестанут работать — пользователи
     просто перелогинятся, это ок.
5. После включения HTTPS на телефонах заработает Wake Lock API — можно
   упростить NoSleep в `MusicPlay.tsx`/`MusicScreen.tsx` (не обязательно).

**Проверка:** регистрация/вход/создание квеста через домен; QR-вход в
угадайку на локальной станции работает с токеном, выданным облаком
(проверка подписи публичным ключом, интернет на станции выключен).

---

## Этап 5. Результаты: станция → облако

**Зачем:** история вечеринок и статистика игроков на сайте.

**Шаги:**

1. `modules/guess-song/musicSession.ts`: при переходе в `finished`
   сохранять снапшот итогов в Mongo станции (новая модель `SessionResult`):
   `{ resultId: uuid, gameId, title, mode, finishedAt, standings: [{ name,
   teamName?, userId?, score }] }`. userId есть только у авторизованных.
2. Кнопка на пульте (`MusicHost.tsx`, фаза finished): «Отправить результаты
   в Questix» → `POST https://<облако>/results` c `{ resultId, ... }`.
   Плюс автоотправка при старте станции для всех неотправленных.
3. Облако: `POST /results` (auth: любой валидный RS256-токен организатора),
   апсерт по `resultId` — повторная отправка не создаёт дублей.
4. Профиль пользователя на сайте: список сыгранных вечеринок и мест.

**Проверка:** сыграть тестовую сессию офлайн → включить интернет →
результат появился в облаке; повторная отправка не дублирует.

---

## Этап 6. Профили деплоя: MODE=cloud | station | all

**Зачем:** один код — два развёртывания. Сейчас `MODE=all` (как есть).

**Шаги:**

1. `core/config.ts`: `mode: process.env.MODE || 'all'`.
2. `index.ts`: монтировать модуль, если
   `mode === 'all' || (mode === 'station' ? module.offline : true)` —
   т.е. станция поднимает только offline-модули (guess-song), облако — все.
   Квесты на станции недоступны, угадайка в облаке доступна (для онлайн-
   вечеринок), но по умолчанию играется на станции.
3. `GET /platform/info` → `{ mode, kinds: [...] }`; фронт скрывает разделы,
   которых нет в текущем режиме (реестр фильтруется по ответу).
4. Два compose-файла: `docker-compose.yml` (станция: mongo+backend+frontend,
   MODE=station, публичный ключ) и `docker-compose.cloud.yml`
   (MODE=cloud, приватный ключ, Caddy).

**Проверка:** `MODE=station` — квесты скрыты, угадайка офлайн работает;
`MODE=cloud` — всё как раньше; регресс на `MODE=all`.

---

## Этап 7. Квиз + выделение session-kernel

**Предусловие: есть конкретный дизайн квиза.** Не начинать без него —
абстракция по одному примеру (угадайке) получится кривой.

**Порядок:**

1. Написать квиз как модуль `modules/quiz`, КОПИРУЯ нужные куски из
   guess-song (да, копипастой — осознанно).
2. Когда квиз заработал, выделить в `core/partySession.ts` то, что
   совпало в двух модулях (ожидаемо): лобби/ready, роли admin/screen/player,
   базовая стейт-машина фаз, пауза с заморозкой таймеров, баззер
   («первый пришедший на сервер побеждает»), счёт solo/team, блокировки,
   реконнект по playerId, сообщение итогов.
3. Перевести оба модуля на kernel. E2E обеих игр — регрессия.
4. Общие UI-компоненты в `frontend/src/core/party/`: круг-баззер, HUD
   с очками, экран лобби с QR, финальная таблица, интро-заставки.

**Проверка:** оба старых E2E зелёные + новый E2E квиза по образцу
`tests/music-flow-test.cjs`.

---

## Этап 8. Внешний API для сторонних модулей

**Предусловие: есть реальный сторонний разработчик с реальной игрой.**
До этого — не строить: API без потребителя получается неудобным.

**Состав (минимум):**

1. Регистрация внешнего модуля в облачной админке → `moduleId` + `apiKey`
   (хэш в БД) + `kind` + `baseUrl` модуля.
2. REST для модуля (заголовок `X-Api-Key`, доступ только к своему kind):
   - `POST /ext/games` → создать инстанс, получить `code`;
   - `GET  /ext/games/:id/players` — кто пришёл по коду;
   - `POST /ext/games/:id/results` — итоги (формат этапа 5).
3. Вход игрока: платформа по коду видит внешний kind и редиректит на
   `baseUrl?token=<JWT RS256, 5 минут, payload: gameId, playerId, name>`.
   Модуль проверяет подпись публичным ключом платформы. Реалтайм модуль
   держит сам.
4. Правило «dogfood»: перед публикацией перевести квиз (этап 7) на этот
   же контракт хотя бы в тестовом режиме — дыры контракта чинить до, а
   не после появления сторонних.

---

## Сводная очерёдность

| # | Этап | Размер | Статус | Условие старта |
|---|------|--------|--------|----------------|
| 1 | Bundle экспорт/импорт | S | сделан | сразу |
| 2 | core/modules + реестр | M | сделан | после 1 |
| 3 | organizerOf по типам | S | сделан | после 2 |
| 4 | Облако + RS256 | M | сделан | когда нужен онлайн для квестов |
| 5 | Результаты вверх | S | сделан | после 4 |
| 6 | MODE-профили | S | сделан | после 4 |
| 7 | Квиз + kernel | L | ждёт | есть дизайн квиза |
| 8 | Внешний API | M | ждёт | есть сторонний разработчик |

Этапы 1–6 сделаны: облако развёрнуто, станция шлёт итоги наверх.
7–8 — по потребности, не впрок: браться, когда появится дизайн квиза и
реальный сторонний потребитель API соответственно.
