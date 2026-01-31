# Web Kanban UI (v1)

## Решение v1
- Читать быстро из `pm/_meta/index.json`
- Писать изменения (drag&drop) через маленький backend API, который обновляет `.md` файлы (frontmatter) атомарно.

## Почему не чисто статик
Статический сайт + index.json хорош для read-only, но для drag&drop нужно надёжно:
- валидировать status
- делать атомарные записи
- избегать конфликтов

## Минимальные API эндпоинты (контракт)
- `GET /api/index` → вернуть `pm/_meta/index.json`
- `POST /api/task/:id/status` body `{status}` → обновить md + updated + обновить index
- `PATCH /api/task/:id` body `{due, priority, tags, title}` (whitelist)
- `POST /api/refresh` → пересборка index (dev)

## UI scope
- колонки: todo/doing/blocked/done
- фильтр по project
- поиск по title
- drag&drop карточек

## Безопасность (локально)
- запуск локально через openclaw gateway
- доступ по token
