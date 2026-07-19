#!/bin/sh
# Деплой Questix на VPS с локальной машины (Git Bash).
# Использование: sh deploy/deploy.sh root@81.90.28.28
# Доступ — по SSH-ключу. Код уезжает tar-ом (без node_modules/.git),
# secrets/ копируются отдельно, сборка и запуск — на сервере.
set -e

HOST="${1:?Использование: sh deploy/deploy.sh user@host}"
DIR=/opt/questix

echo "== Заливаю код на $HOST:$DIR =="
tar czf - \
  --exclude node_modules --exclude .git --exclude dist \
  --exclude backups --exclude secrets --exclude media \
  backend frontend deploy docker-compose.cloud.yml .env.cloud.example \
  | ssh "$HOST" "mkdir -p $DIR && tar xzf - -C $DIR"

echo "== Копирую JWT-ключи =="
scp -q secrets/jwt.key secrets/jwt.pub "$HOST:$DIR/secrets/"

echo "== Проверяю .env на сервере =="
ssh "$HOST" "[ -f $DIR/.env ] || { cp $DIR/.env.cloud.example $DIR/.env; echo '!! Создан $DIR/.env из примера — ЗАПОЛНИТЕ пароль Mongo перед стартом'; }"

echo "== Сборка и запуск (только проект questix, чужие контейнеры не трогаются) =="
ssh "$HOST" "cd $DIR && docker compose -f docker-compose.cloud.yml -p questix up -d --build"

echo "== Статус =="
ssh "$HOST" "docker compose -p questix ps"
echo "Готово."
