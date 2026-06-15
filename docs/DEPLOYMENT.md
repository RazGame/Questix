# Deployment

## Docker Compose

Создайте `.env`:

```bash
cp .env.example .env
```

Отредактируйте значения:

```env
MONGO_INITDB_ROOT_USERNAME=quest_admin
MONGO_INITDB_ROOT_PASSWORD=change_this_password
JWT_SECRET=change_this_jwt_secret
```

Запуск:

```bash
docker compose up -d --build
```

Проверка:

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
```

## Development MongoDB

Если backend/frontend запускаются локально:

```bash
docker compose -f docker-compose.dev.yml up -d
```

## Production Notes

- Задайте сильный `JWT_SECRET`.
- Задайте сильный `MONGO_INITDB_ROOT_PASSWORD`.
- Настройте `CORS_ORIGIN` под домен frontend.
- Не коммитьте `.env`.
- Используйте HTTPS перед публичным frontend/API.
- Для production лучше вынести MongoDB volume/backup в отдельную управляемую схему.

## Backup MongoDB

Создать backup:

```bash
docker exec quest-mongodb mongodump \
  --username "$MONGO_INITDB_ROOT_USERNAME" \
  --password "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --out /dump
```

Скопировать backup на хост:

```bash
docker cp quest-mongodb:/dump ./mongo-dump
```

Восстановить:

```bash
docker cp ./mongo-dump quest-mongodb:/dump
docker exec quest-mongodb mongorestore \
  --username "$MONGO_INITDB_ROOT_USERNAME" \
  --password "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  /dump
```

## Useful Commands

```bash
docker compose down
docker compose down -v
docker compose up -d --build
docker compose build --no-cache
```
