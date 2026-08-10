#!/bin/sh
# Бэкап Mongo Questix (запускается на сервере, желательно кроном).
# Крон (ежедневно в 04:00): crontab -e →
#   0 4 * * * sh /opt/questix/deploy/backup-mongo.sh >> /opt/questix/backups/backup.log 2>&1
# ВАЖНО: копию бэкапа периодически забирать С сервера (scp на свою машину).
set -e
cd /opt/questix

STAMP=$(date +%Y%m%d-%H%M%S)
. ./.env 2>/dev/null || true

docker compose -p questix exec -T mongodb mongodump \
  -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin --db quest \
  --archive=/backups/quest-$STAMP.archive --gzip

# держим последние 14 бэкапов
ls -1t backups/quest-*.archive 2>/dev/null | tail -n +15 | xargs -r rm --
echo "backup done: quest-$STAMP.archive"
