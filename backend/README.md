# Backend

Express + TypeScript API для Questix.

## Запуск

```bash
npm install
cp .env.example .env
npm run dev
```

PowerShell:

```powershell
Copy-Item .env.example .env
npm run dev
```

Backend слушает `PORT`, по умолчанию `5000`.

## Скрипты

- `npm run dev` - запуск через `ts-node`.
- `npm run build` - компиляция TypeScript в `dist`.
- `npm start` - запуск `dist/index.js`.
- `npm run watch` - TypeScript watch mode.

## Env

См. `.env.example`.

Ключевые переменные:

- `PORT`
- `MONGODB_URI`
- `JWT_SECRET`
- `JWT_EXPIRE`
- `BCRYPT_ROUNDS`
- `CORS_ORIGIN`

Не коммитьте `.env`.

## Основные Модули

```text
src/
├── config/       # env и MongoDB
├── controllers/  # auth, games, applications, tasks, progress
├── middleware/   # auth/admin middleware
├── models/       # User, Game, GameAppl, Task, GameTeamProgress
├── routes/       # Express routes
├── types/        # TypeScript interfaces
└── utils/        # password/JWT helpers
```

## API

Swagger доступен на:

```text
http://localhost:5000/api-docs
```

Подробности: [../docs/API.md](../docs/API.md).
