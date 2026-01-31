---
id: TASK-0007
title: "Telegram inline buttons: ToDo/Doing/Done/Snooze 1d"
status: done
project: vextaibot
priority: P1
tags: [telegram, pm]
created: 2026-01-30T23:32:54.278Z
updated: 2026-01-31T01:17:43+01:00
estimate: 4h
---

## Цель
Дать быстрые действия прямо под сообщением бота со списком задач:
- ToDo → `status: todo`
- Doing → `status: doing`
- Done → `status: done`
- Snooze 1d → сдвинуть `due` на +1 день (или выставить due=tomorrow, если due отсутствует)

Без ввода текста, одним тапом.

## UX / Где показывать кнопки
Кнопки показываются только в сообщениях, которые содержат задачи (TASK-XXXX):
- ответы `/today`
- ответы `/inbox` (если умеем сопоставлять пункт inbox с task-id; в MVP можно не показывать)
- отдельное сообщение “Карточка задачи” (если будет команда `/task TASK-0007` в будущем)

### Рекомендация по UX (MVP)
Под каждым пунктом списка (или под сообщением целиком) дать кнопки.
Лучше **под каждым пунктом**, чтобы действие применялось к конкретной задаче.

Пример сообщения (concept):
- `TASK-0007 — Telegram inline buttons (P1)`
  [ToDo] [Doing] [Done] [Snooze 1d]

Если Telegram/SDK не позволяет 4 кнопки в строке, то 2x2.

## Callback-data формат
Нужен компактный, стабильный, с явной версией.

Предложение:
- `pm:v1:status:<todo|doing|done>:<TASK-XXXX>`
- `pm:v1:snooze:1d:<TASK-XXXX>`

Примеры:
- `pm:v1:status:doing:TASK-0007`
- `pm:v1:snooze:1d:TASK-0007`

Требования:
- длина < 64 байт (ограничение Telegram callback_data)
- без пробелов

## Поведение кнопок

### Status buttons (ToDo/Doing/Done)
- найти task-файл по id (через index.json или поиск по дереву tasks)
- обновить YAML frontmatter:
  - `status: <new>`
  - `updated: now`
- ответить “toast” (answerCallbackQuery) + обновить текст сообщения (editMessageText), чтобы отражал новый статус

### Snooze 1d
- вычислить `tomorrow` в локальной TZ (Europe/Stockholm)
- если `due` отсутствует → поставить `due: tomorrow`
- если `due` есть → поставить `due: max(due+1d, tomorrow)` (чтобы “снуз” всегда двигал вперёд)
- `updated: now`
- UI: обновить строку задачи (например добавить `due`)

## Обновление сообщения (важно)
Telegram inline кнопки хороши, когда после нажатия видно результат.

Рекомендация:
- После успешного действия делать `editMessageText`/`editMessageReplyMarkup`:
  - в строке задачи заменить/добавить `status` badge: `[doing]` / `[done]`
  - опционально показать `due: YYYY-MM-DD`

Если редактирование не удалось (сообщение старое/удалено) — всё равно выполнить действие и ответить callback-toast.

## Реализация в OpenClaw
Вариант A (предпочтительно): использовать нативные inline buttons канала Telegram (capabilities=inlineButtons).
- При отправке сообщения ботом прикладывать inline keyboard.
- При получении callback — роутить в обработчик `pmCallbackHandler`.

Вариант B: если inline buttons недоступны в tool API напрямую — эмулировать через “командные” кнопки (A2UI/Canvas) нельзя, потому что нужен Telegram UI. Тогда придётся расширять OpenClaw message plugin, чтобы поддержать inline keyboard payload.

## Хранилище соответствий message→tasks
Чтобы по callback можно было понять, какую задачу меняем:
- идеальный вариант: зашивать TASK-id в callback_data (см. формат выше) — **тогда state не нужен**.
- если одна клавиатура под сообщением и надо знать “какой пункт” — всё равно лучше шить id в callback.

## Ошибки/Edge cases
- TASK-id не найден → toast: `Не нашёл TASK-0007`.
- конфликт при редактировании файла (редко) → toast: `Не удалось обновить файл, попробуй ещё раз`.
- задача уже `done` → можно сделать idempotent (не ошибка).

## Чеклист
- [x] Callback_data формат (pm:v1:...)
- [x] Реализован обработчик callback → update task frontmatter
- [x] Реализован `Snooze 1d` (правила с due)
- [x] Best-effort обновление текста сообщения после нажатия (replace строки с TASK-id)
- [x] Unit-тест: snooze 1d без due

Примечание: интеграция с конкретным OpenClaw Telegram plugin (answerCallbackQuery/editMessageText) — через возвращаемый structured response (toast/editText/keyboard).

## Связано
- TASK-0006: команды /add /today /inbox /done
- TASK-0003: update-status/due/tags + updated timestamp

## Лог
- 2026-01-30T23:32:54.278Z: создано планом
- 2026-01-31T00:05:00.000Z: добавлена спецификация inline buttons и callback формата
- 2026-01-31T01:14:10+01:00: старт реализации inline buttons
- 2026-01-31T01:17:43+01:00: реализован обработчик callback pm:v1:* (status + snooze 1d), генерация inline keyboard
