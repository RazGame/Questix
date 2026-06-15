# Frontend

React + TypeScript + Vite frontend для Questix.

## Запуск

```bash
npm install
cp .env.example .env.local
npm run dev
```

PowerShell:

```powershell
Copy-Item .env.example .env.local
npm run dev
```

Frontend слушает http://localhost:5173.

## Скрипты

- `npm run dev` - Vite dev server.
- `npm run build` - TypeScript check + production build.
- `npm run preview` - preview build на `0.0.0.0:5173`.

## Env

См. `.env.example`.

- `VITE_API_URL` - URL backend API.

Не коммитьте `.env.local`.

## Структура

```text
src/
├── components/   # Navbar, PrivateRoute, ErrorBoundary
├── pages/        # Home, Login, Signup, Games, GameDetail, MyAppls, AdminPanel,
│                 # TaskManager, QuestGame, TeamManager, GameResults, Profile
├── services/     # Axios API wrappers (games, appls, progress, teams, results, users)
├── store/        # Zustand auth store
├── types/        # TypeScript types
├── utils/        # date helpers
├── App.tsx
└── index.tsx
```

## Важные Экраны

- `/games` - вкладки `Мои активные квесты`, `Предстоящие`, `Завершённые`.
- `/games/:id` - детали квеста; заявку от команды подаёт капитан.
- `/my-appls` - заявки моих команд и вход в активную игру.
- `/teams`, `/teams/:teamId` - мои команды, состав, управление (капитан), выход из команды.
- `/profile` - редактирование своего профиля.
- `/games/:gameId/results` - статистика игры: матрица «команды x шаги» с сортировками, публикация результатов и логи для модераторов.
- `/admin` - квесты, заявки, результаты и назначение ролей (вкладка «Пользователи»).
- `/admin/game/:gameId/tasks` - задания.
- `/game/:gameId/play/:gameApplId` - прохождение квеста командой.
