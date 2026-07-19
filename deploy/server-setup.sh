#!/bin/sh
# Подготовка VPS под Questix. НЕИНВАЗИВНО: на сервере уже крутится другой
# Docker-стек — ничего не переустанавливаем, firewall не трогаем, только
# проверяем окружение и создаём каталоги.
# Запуск на сервере: sh /opt/questix/deploy/server-setup.sh
set -e

echo "== Проверка Docker =="
if command -v docker >/dev/null 2>&1; then
  docker --version
else
  echo "Docker не найден. Установка: curl -fsSL https://get.docker.com | sh"
  echo "(не ставим автоматически, чтобы не задеть существующее окружение)"
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  docker compose version
else
  echo "docker compose plugin не найден: apt-get install docker-compose-plugin"
  exit 1
fi

echo ""
echo "== Уже запущенные контейнеры (НЕ трогаем) =="
docker ps --format 'table {{.Names}}\t{{.Ports}}'

echo ""
echo "== Занятые порты на хосте =="
ss -tlnp 2>/dev/null | awk 'NR==1 || /:80 |:443 |:8080 |:27017 /' || true
echo "Если 80/443/8080 заняты чужим сервисом — поменяйте публикацию портов"
echo "в docker-compose.cloud.yml (например 8081:80) перед запуском."

mkdir -p /opt/questix/backups /opt/questix/secrets
echo ""
echo "== Каталоги /opt/questix готовы =="
