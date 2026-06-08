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
├── pages/        # Home, Login, Signup, Games, GameDetail, MyAppls, AdminPanel, TaskManager, QuestGame
├── services/     # Axios API wrappers
├── store/        # Zustand auth store
├── types/        # TypeScript types
├── utils/        # date helpers
├── App.tsx
└── index.tsx
```

## Важные Экраны

- `/games` - вкладки `Мои активные квесты`, `Предстоящие`, `Завершённые`.
- `/games/:id` - детали квеста и подача заявки.
- `/my-appls` - заявки пользователя и вход в активную игру.
- `/admin` - квесты, заявки и результаты.
- `/admin/game/:gameId/tasks` - задания.
- `/game/:gameId/play/:gameApplId` - прохождение.
