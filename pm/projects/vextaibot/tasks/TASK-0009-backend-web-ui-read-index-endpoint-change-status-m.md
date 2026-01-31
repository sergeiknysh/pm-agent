---
id: TASK-0009
title: "Backend для Web UI: read index + endpoint change status (правка md)"
status: doing
project: vextaibot
priority: P1
tags: [web, api]
created: 2026-01-30T23:32:54.278Z
updated: 2026-01-31T01:14:10+01:00
estimate: 6h
---

## Решение (v1)

**Выбираем маленький сервер**, а не purely static:
- Web Kanban должен уметь менять статус/поля → нужно писать в `.md` на диске.
- Static + `index.json` даёт только read-only (если не использовать экзотику типа File System Access API/локальные права).
- Сервер также решает: блокировка конкурентных правок, атомарность, валидация Task Spec, генерация `index.json`.

## Минимальная архитектура

- **Node.js + Fastify** (или Express) как лёгкий HTTP API.
- `pm/_meta/index.json` — кэш для UI.
- Пакет для frontmatter: `gray-matter`.
- Запись файлов: `fs/promises` + атомарный write (tmp + rename).
- (опционально) `chokidar` → авто-реген индекса при изменениях.

Директории:
- `pm/projects/*/tasks/*.md` — source of truth
- `pm/_meta/index.json` — сгенерированный индекс
- `web/` (или `pm-ui/`) — фронтенд (Vite build), сервер отдаёт статику

## Контракт данных

### index.json (минимум)
Каждый элемент:
- `id`, `title`, `status`, `project`, `priority`, `due`, `tags`, `updated`, `path`

### Правки через API
На запись разрешаем только whitelisted поля (v1):
- `status`, `priority`, `due`, `tags`, `title` (опционально позже)

## API Endpoints (v1)

### Read
- `GET /api/index`
  - отдаёт содержимое `pm/_meta/index.json`

- `GET /api/task/:id`
  - находит файл по индексу (id→path)
  - отдаёт `{ frontmatter, body, path }`

### Write
- `POST /api/task/:id/status`
  - body: `{ "status": "todo"|"doing"|"blocked"|"done" }`
  - сервер: читает md → обновляет YAML → обновляет `updated` → пишет файл атомарно
  - затем обновляет `pm/_meta/index.json` (инкрементально или полная реген)

- `PATCH /api/task/:id`
  - body: `{ "due": "YYYY-MM-DD", "priority": "P1", "tags": [..] }`
  - та же схема записи + обновление индекса

### Maintenance (dev)
- `POST /api/refresh`
  - триггерит реген `index.json` (полезно без watch)

## Нефункциональные требования (минимум)

- **Атомарность:** писать во временный файл рядом → `rename`.
- **Валидация:** отклонять неизвестные статусы и некорректные даты.
- **Безопасность (локально):** по умолчанию слушать `127.0.0.1`.
- **CORS:** только для dev (если UI отдельно), иначе не нужен.

## Чеклист

- [ ] Выбрать стек: Fastify + gray-matter + zod (валидация)
- [ ] Реализовать чтение `pm/_meta/index.json`
- [ ] Реализовать `POST /api/task/:id/status` (atomic write + updated)
- [ ] Реализовать `PATCH /api/task/:id` (whitelist полей)
- [ ] Обновление `index.json` после записи (полная реген достаточно для v1)
- [ ] Добавить `POST /api/refresh` для удобства
- [ ] README: как запустить сервер, где лежит pm-root

## Acceptance Criteria

- UI (или curl) может:
  - получить индекс
  - сменить статус задачи и увидеть изменение в соответствующем `.md`
  - после смены статуса `GET /api/index` возвращает обновлённый статус

## Лог
- 2026-01-30T23:32:54.278Z: создано планом
- 2026-01-31T01:14:10+01:00: старт реализации backend API для Web UI
- 2026-01-31T00:40:00.000Z: уточнён план (выбран small server + контракты API)
