#!/bin/bash
# Отправка уведомления в Telegram
# Использование: ./scripts/notify-telegram.sh "Сообщение"

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Загружаем .env если есть
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
fi

MESSAGE="${1:-Задача выполнена ✅}"

if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "Error: TELEGRAM_BOT_TOKEN not set"
  exit 1
fi

if [ -z "$TELEGRAM_CHAT_ID" ]; then
  echo "Error: TELEGRAM_CHAT_ID not set"
  exit 1
fi

curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": \"${TELEGRAM_CHAT_ID}\", \"text\": \"${MESSAGE}\"}" \
  > /dev/null

echo "✅ Sent to Telegram: $MESSAGE"
