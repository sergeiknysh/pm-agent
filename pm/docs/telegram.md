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

## Реализация (в этом репо)
См. `src/pm/telegram.ts`:
- `handleTelegramPmMessage(repo, msg)` — команды `/add /inbox /today /done`
- `handleTelegramPmCallback(repo, cb)` — callback-data `pm:v1:*`

Обе функции **не разговаривают с Telegram напрямую** — они возвращают structured response:
- `text` (+ опционально `keyboard`) для ответа на сообщение
- `toast` (+ `editText`, `editKeyboard`) для callback (под answerCallbackQuery/editMessageText)

Контекст «последнего списка» хранится в `pm/_meta/telegram-context.json`.

## Минимальная проверка
- unit: `npm test`
- ручной smoke (в OpenClaw):
  1) отправить `/add купить батарейки`
  2) отправить `/today`
  3) отправить `/done TASK-XXXX` или `/done 1` после `/today`
  4) нажать inline кнопку (если канал/плагин прокидывает callback_data) и убедиться, что статус/due в task-файле обновились.
