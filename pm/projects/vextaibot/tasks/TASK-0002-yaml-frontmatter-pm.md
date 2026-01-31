---
id: TASK-0002
title: "Сделать парсер YAML frontmatter + загрузчик задач из pm/"
status: done
project: vextaibot
priority: P0
tags: [core]
created: 2026-01-30T23:32:54.278Z
updated: 2026-01-31T00:36:00.000Z
estimate: 4h
---

## Контекст

Нужен парсер Task Spec v1: YAML frontmatter + body markdown, плюс загрузка задач из файлов в `pm/projects/**/tasks/*.md`.

## Чеклист

- [x] Парсить YAML frontmatter `--- ... ---` (без автоконвертации timestamps в Date)
- [x] Валидировать обязательные поля (id/title/status/project/created/updated)
- [x] Загрузка всех задач из `pm/projects/**/tasks/*.md`

## Лог
- 2026-01-30T23:32:54.278Z: создано планом
- 2026-01-31T00:36:00.000Z: реализовано в `src/pm/frontmatter.ts`, `src/pm/task.ts`, `src/pm/repo.ts` (deps: `js-yaml`)
