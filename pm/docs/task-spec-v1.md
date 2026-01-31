# Task Spec v1

Каждая задача — Markdown-файл с YAML frontmatter.

## Путь
Рекомендуемая структура:

```
pm/projects/<project>/tasks/<id>-<slug>.md
```

## Frontmatter поля
### Обязательные
- `id`: `TASK-0001`
- `title`: строка
- `status`: `todo | doing | blocked | done`
- `project`: slug проекта (имя папки в `pm/projects/`)
- `created`: ISO-8601
- `updated`: ISO-8601

### Рекомендуемые
- `priority`: `P0 | P1 | P2 | P3`
- `tags`: массив строк (`[web, api]`)
- `due`: `YYYY-MM-DD` или ISO-8601
- `estimate`: `30m | 2h | 1d` (свободный формат, но единый стиль)
- `links`: (опционально) `blocks/relates/duplicates`

## Шаблон
```md
---
id: TASK-0001
title: "Сделать что-то"
status: todo
project: vextaibot
priority: P2
tags: [web]
due: 2026-02-01
created: 2026-01-31T00:00:00+01:00
updated: 2026-01-31T00:00:00+01:00
---

## Контекст

## Чеклист
- [ ] 

## Лог
- 2026-01-31T00:00:00+01:00: создано
```

## Правила обновления
- Любое изменение метаданных обновляет `updated`.
- Статус меняется только через whitelist (`todo/doing/blocked/done`).
