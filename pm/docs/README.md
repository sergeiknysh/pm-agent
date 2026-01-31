# Документация PM-as-Files

Эта папка — “официальные” документы проекта. Источник правды задач — Markdown в `pm/`.

## Разделы
- [Concept](./concept.md) — концепция и принципы (source of truth = файлы)
- [Task Spec v1](./task-spec-v1.md) — формат задачи (YAML frontmatter + Markdown)
- [Workflow](./workflow.md) — как пользоваться ежедневно (Inbox → Triage → Doing/Done)
- [CLI](./cli.md) — команды CLI (`pm/bin/pm.js` и `npm run pm -- ...`)
- [Telegram UX](./telegram.md) — команды и inline buttons (спека)
- [Web Kanban](./web-ui.md) — архитектура v1 (index.json + маленький сервер)

## Быстрые ссылки
- План работ: `pm/PLAN.md`
- Входящие: `pm/inbox.md`
- Проекты: `pm/projects/*/project.md`
- Индекс для UI: `pm/_meta/index.json`

## Переменные окружения
- `PM_ROOT` — путь к папке `pm/` (по умолчанию: `./pm`).
- `PM_SECRETS_ROOT` — путь к секретам (по умолчанию: `/home/sergei/.pm-secrets`).
- `PM_SESSION_TTL_HOURS` — TTL сессии в часах (по умолчанию: 168).
- `PM_SESSION_SECURE` — если `1`/`true`, cookie помечается `Secure`.
- `CORS` / `CORS_ORIGIN` — включить CORS для сервера (см. `src/server.ts`).
