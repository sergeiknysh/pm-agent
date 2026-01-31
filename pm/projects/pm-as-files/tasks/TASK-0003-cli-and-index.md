---
id: TASK-0003
title: "CLI + index generator for PM-as-Files"
status: done
project: pm-as-files
created: 2026-01-31T00:33:00+01:00
updated: 2026-01-31T01:13:30+01:00
priority: P2
tags: [pm, cli]
---

## Context
Нужен минимальный интерфейс для локальной работы: list/create/set/log + генерация `pm/_meta/index.json`.

## Checklist
- [x] `pm list` — список задач
- [x] `pm create --project --title ...` — создать файл задачи
- [x] `pm set <id> status|due <value>` — обновить поля
- [x] `pm log <id> <text>` — append log entry
- [x] `pm index` — сгенерировать `pm/_meta/index.json`

## Notes
CLI: `src/cli.ts` (build → `dist/cli.js`). Скрипт: `npm run pm -- <cmd>`.

## Лог
- 2026-01-31T01:13:30+01:00: зафиксировано как done (CLI и генерация индекса готовы)
