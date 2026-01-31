---
id: TASK-0005
title: "Генератор pm/_meta/index.json из всех задач"
status: done
project: vextaibot
priority: P0
tags: [index]
created: 2026-01-30T23:32:54.278Z
updated: 2026-01-30T23:40:30.000Z
estimate: 3h
---

## Контекст

Web UI (kanban) должен быстро получать список задач, не парся все md на клиенте.
Нужен генератор, который читает задачи из `pm/projects/*/tasks/*.md` (Task Spec v1)
и пишет индекс в `pm/_meta/index.json` с полями:
`id,title,status,project,priority,due,tags,updated,path`.

## Детали реализации

- Скрипт: `pm/scripts/generate-index.mjs`
- Запуск: `node pm/scripts/generate-index.mjs`
- Поиск задач: рекурсивно по `pm/projects/**/tasks/**/*.md`
- Парсинг: простой YAML frontmatter (key: value, inline arrays вида `[a, b]`)
- Выход: JSON-массив объектов (pretty-printed, 2 spaces) в `pm/_meta/index.json`

### Stable sorting (для предсказуемого UI)

Сортировка стабильная, чтобы порядок не «прыгал»:
1) `project` (asc)
2) `status` (todo → doing → blocked → done)
3) `priority` (P0 → P1 → ...)
4) `due` (asc, null в конце)
5) `updated` (desc)
6) `id` (asc)

## Чеклист

- [x] Реализовать генератор `pm/_meta/index.json` из файлов задач
- [x] Включить поля: id,title,status,project,priority,due,tags,updated,path
- [x] Определить стабильную сортировку для UI
- [x] Проверить на текущих задачах (создаётся `pm/_meta/index.json`)

## Лог
- 2026-01-30T23:32:54.278Z: создано планом
- 2026-01-30T23:40:30.000Z: сделан скрипт `pm/scripts/generate-index.mjs`, генерирует `pm/_meta/index.json`
