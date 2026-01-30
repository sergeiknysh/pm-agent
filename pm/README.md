# PM-as-Files

Это минималистичный трекер задач, где **источник правды — Markdown-файлы в git**.

## Быстрый старт
- Входящие: `pm/inbox.md`
- Проекты: `pm/projects/<project>/`
- Задачи: `pm/projects/<project>/tasks/*.md`
- Индекс для UI: `pm/_meta/index.json` (генерируется)

## Task Spec v1
Каждая задача — `.md` файл с YAML frontmatter:

```md
---
id: TASK-0001
title: "..."
status: todo
project: vextaibot
created: 2026-01-31T00:00:00+01:00
updated: 2026-01-31T00:00:00+01:00
priority: P2
tags: [web]
due: 2026-02-01
estimate: 2h
---

## Контекст
...
```

Подробный план: см. `pm/PLAN.md`.
