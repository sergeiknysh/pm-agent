---
id: TASK-0008
title: "Web UI v1: Kanban доска по status (todo/doing/blocked/done)"
status: doing
project: vextaibot
priority: P2
tags: [web, ui]
created: 2026-01-30T23:32:54.278Z
updated: 2026-01-31T01:14:10+01:00
estimate: 8h
---

## Решение (v1)

UI делаем как лёгкий SPA, который:
- читает `GET /api/index`
- показывает канбан (todo/doing/blocked/done)
- поддерживает drag&drop между колонками
- при переносе вызывает `POST /api/task/:id/status`

**Почему не purely static:** drag&drop должен менять markdown-файлы, поэтому UI работает поверх небольшого локального API (см. TASK-0009).

## Предлагаемый стек

- **Vite + React + TypeScript**
- Drag&drop: **@dnd-kit/core** (или `react-beautiful-dnd`/`hello-pangea/dnd`)
- UI: минимально (CSS modules / Tailwind по вкусу)

Альтернатива (ещё проще): Svelte + dnd action, но React/Vite проще для большинства.

## UX / Функциональность v1

- Колонки: **To Do / Doing / Blocked / Done**
- Карточка: `title`, `id`, `priority`, `due` (если есть), теги (чипы)
- Фильтры:
  - dropdown project
  - search по title/id/tag
- Drag&drop:
  - перенос карточки меняет status
  - optimistic update + откат при ошибке
- Клик по карточке открывает side panel (v1: read-only details)

## Минимальная структура страниц

- `/` → board
  - загрузка индекса
  - группировка по status

## API зависимости

- `GET /api/index`
- `POST /api/task/:id/status`
- (опционально v1.1) `GET /api/task/:id` для side panel

## Чеклист

- [ ] Создать Vite app (React+TS)
- [ ] Типы: `TaskIndexItem` (соответствует index.json)
- [ ] Board layout: 4 columns
- [ ] Render cards + basic styling
- [ ] Drag&drop between columns (@dnd-kit)
- [ ] On drop → call `POST /api/task/:id/status`
- [ ] Optimistic update + toast/error state
- [ ] Filters: project + search
- [ ] (Опционально) Side panel: fetch `GET /api/task/:id`

## Acceptance Criteria

- При открытии UI показывает задачи из `index.json` в правильных колонках.
- Перетаскивание карточки в другую колонку вызывает API и после refresh статус остаётся новым.

## Лог
- 2026-01-30T23:32:54.278Z: создано планом
- 2026-01-31T01:14:10+01:00: старт реализации Web UI
- 2026-01-31T00:40:00.000Z: уточнён план UI (Vite+React+TS, dnd-kit, контракты)
