# Telegram UX (spec)

Цель: управлять задачами через Telegram, не заводя отдельную БД.

## MVP команды
- `/add <text>` — добавить в inbox (или создать задачу)
- `/inbox` — показать входящие/последние задачи
- `/today` — задачи на сегодня + overdue (status != done)
- `/done <TASK-XXXX|n>` — закрыть задачу

## Reply-friendly
- `/done` в ответ на сообщение, где есть `TASK-XXXX` → закрыть эту задачу.
- `/add` в ответ на сообщение → взять текст отвеченного сообщения.

## Минимальный контекст без БД
Для `/done 2` нужен контекст “последнего списка” по чату:
- файл: `pm/_meta/telegram-context.json`
- хранить последние N задач, TTL (например 24h)

## Inline buttons
Callback-data stateless:
- `pm:v1:status:<todo|doing|done>:<TASK-XXXX>`
- `pm:v1:snooze:1d:<TASK-XXXX>`

### Snooze 1d
- если `due` нет → `due = tomorrow`
- если `due` есть → `due = max(due+1d, tomorrow)`
- обновить `updated`
