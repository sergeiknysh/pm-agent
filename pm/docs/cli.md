# CLI

Сейчас есть два CLI пути:

## A) Inbox CLI (no deps)
Файл: `pm/bin/pm.js`

Примеры:
```bash
node pm/bin/pm.js inbox add "позвонить Пете P1 @vextaibot #biz due:2026-02-01"
node pm/bin/pm.js inbox triage --non-interactive --yes
```

## B) TypeScript CLI (npm run pm)
После установки зависимостей:
```bash
npm install
npm run build
npm run pm -- list
npm run pm -- index
```

### Команды (ориентир)
- `list` — список задач
- `create` — создать задачу
- `set` — изменить поля (status/due/tags/priority/title)
- `log` — дописать строку в `## Лог`
- `index` — сгенерировать `pm/_meta/index.json`

> Примечание: в репозитории сейчас параллельно существуют два CLI. В дальнейшем их можно унифицировать.
