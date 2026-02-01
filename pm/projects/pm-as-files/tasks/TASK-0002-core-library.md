---
id: TASK-0002
title: 'Core library: Task Spec v1 parser + CRUD'
status: doing
project: pm-as-files
created: '2026-01-31T00:32:00+01:00'
updated: '2026-02-01T15:48:38.965Z'
priority: P1
tags:
  - pm
  - files
  - typescript
---

## Context
Нужна базовая библиотека для работы с задачами как файлами: парсинг markdown+YAML frontmatter, загрузка из `pm/`, операции CRUD.

## Checklist
- [x] Парсинг YAML frontmatter (`--- ... ---`) + body
- [x] Валидация Task Spec v1 (обязательные поля + enums)
- [x] Загрузка всех задач из `pm/projects/**/tasks/*.md`
- [x] CRUD: create task file (auto id), update meta (status/due/tags/priority/title), append log entry
- [x] Обновление timestamps (`updated`)
- [x] Генерация `_meta/index.json`
- [x] Мини-CLI для ручного использования
- [x] Тесты (node:test)

## Notes
Реализовано в `src/pm/*` (TS) с минимальным deps (`js-yaml`).

## Лог
- 2026-01-31T01:13:30+01:00: зафиксировано как done (реализация готова)
