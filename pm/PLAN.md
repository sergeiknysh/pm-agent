# PM-as-Files (Markdown) — Plan

Цель: сделать task/project management tool, где **источник правды — Markdown-файлы в git**, а управление возможно:
1) через **Web Kanban UI**
2) через **Vexta/OpenClaw** (чат-команды)
3) через **Telegram** (через Vexta: команды + кнопки)

## 0) Принципы
- **Source of truth:** файлы в `pm/`.
- **Одна задача = один файл** (простые git-диффы, понятные мерджи).
- Метаданные задачи храним в **YAML frontmatter**.
- Любые изменения — через атомарные операции (редактирование YAML + запись в changelog).
- UI (Kanban) — **представление**, строится из файлов.

## 1) Структура репозитория
```
pm/
  PLAN.md
  README.md
  inbox.md
  projects/
    vextaibot/
      project.md
      tasks/
        TASK-0001-....md
  _meta/
    index.json        # генерируемый индекс для UI (cache)
    events.log.md     # опционально: журнальный лог изменений (человеко-читаемый)
```

## 2) Спецификация задачи (Task Spec v1)
Каждый task-файл:
- YAML frontmatter (машиночитаемо)
- тело Markdown (контекст/чеклист/лог)

Обязательные поля:
- `id` (TASK-0001)
- `title`
- `status` (todo | doing | blocked | done)
- `project`
- `created`, `updated` (ISO-8601)

Рекомендуемые:
- `priority` (P0..P3)
- `tags: []`
- `due` (YYYY-MM-DD или ISO)
- `estimate` (например `30m`, `2h`, `1d`)
- `links` (blocks/relates/duplicates)

## 3) Команды (Vexta/Telegram) — v1
Цель: минимальный набор, чтобы жить этим каждый день.

### Inbox
- `add <text>` → добавить в `pm/inbox.md` (режим по умолчанию)
- `triage inbox` → превратить строки из inbox в task-файлы, запросить проект/приоритет/срок

### Работа с задачами
- `list [project] [status]` → список
- `today` → due today + doing
- `overdue` → просроченные
- `doing <id|query>` → status=doing
- `done <id|query>` → status=done
- `set <id> due <date>` / `set <id> priority P1` / `tag <id> +x -y`
- `show <id>` → вывести карточку

### Telegram UX
- `/add ...`, `/today`, `/inbox`, `/done ...`
- Inline buttons на карточке: **To Do / Doing / Done / Snooze 1d**

## 4) Индекс для UI (index.json)
Генерируемый файл `pm/_meta/index.json` со списком задач:
- id, title, status, project, priority, due, tags, updated, path

Используется Web UI для быстрого рендера без парсинга всех md на клиенте.

## 5) Web Kanban UI (v1)
- 3–4 колонки по status (todo/doing/blocked/done)
- фильтр по project + поиск
- drag&drop между колонками → вызывает backend endpoint “change status” (а тот правит md)

Режимы деплоя:
- локально в WSL/на сервере
- доступ через gateway (и/или позже tailscale)

## 6) Технические задачи (итерации)
### Iteration A (MVP: Files + Commands)
1. Парсер/валидатор Task Spec v1
2. CRUD-операции над задачами (создать/обновить статус/даты/теги)
3. Inbox flow (append + triage)
4. Генератор `index.json`

### Iteration B (Telegram)
1. Команды `/add`, `/today`, `/inbox`, `/done`
2. Inline buttons для смены статуса + snooze
3. Нотификации (опционально): due soon, overdue digest

### Iteration C (Web UI)
1. Сервер: отдача index + endpoints на изменение задач
2. UI: Kanban board, drag&drop

## 7) Правила работы (чтобы не болело)
- Git: перед массовыми правками делать pull/rebase.
- Автоматически коммитить изменения можно позже (feature flag). Пока — вручную.
- Секреты не храним в репо.

## 8) Definition of Done (MVP)
- Можно добавить задачу из Telegram → она в `inbox.md`
- Можно “triage inbox” → появились md-файлы задач
- Можно командой `doing`/`done` менять статус
- Можно открыть Web Kanban и перетащить карточку между колонками

---
Следующий шаг: создать `pm/README.md`, `pm/inbox.md`, шаблон `project.md` и набор первичных задач.
