---
id: TASK-0003
title: "Сделать операции: create/update status/due/tags + запись updated + лог в файле"
status: done
project: vextaibot
priority: P0
tags: [core]
created: 2026-01-30T23:32:54.278Z
updated: 2026-01-31T00:36:30.000Z
estimate: 6h
---

## Контекст

CRUD поверх task-файлов: создание, обновление меты (status/due/tags/priority/title), обновление `updated`, добавление записи в лог секцию.

## Чеклист

- [x] Create task file (auto id, slug в filename)
- [x] Update status/due/tags/priority/title + автообновление `updated`
- [x] Append log entry в `## Log` (или создать секцию, если нет)
- [x] Генерация `pm/_meta/index.json`

## Лог
- 2026-01-30T23:32:54.278Z: создано планом
- 2026-01-31T00:36:30.000Z: реализовано в `TaskRepo` (`src/pm/repo.ts`) + helpers (`src/pm/task.ts`), добавлен CLI (`src/cli.ts`) и тесты
