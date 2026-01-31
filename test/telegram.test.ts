import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { TaskRepo } from '../src/pm/repo.js';
import { serializeTaskFile } from '../src/pm/task.js';
import type { ParsedTaskFile } from '../src/pm/types.js';
import { handleTelegramPmMessage, handleTelegramPmCallback } from '../src/pm/telegram.js';

function taskFile(t: ParsedTaskFile): string {
  return serializeTaskFile(t);
}

async function mkRepo(): Promise<{ repo: TaskRepo; pmRoot: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-as-files-'));
  const pmRoot = path.join(dir, 'pm');
  await fs.mkdir(pmRoot, { recursive: true });
  return { repo: new TaskRepo({ pmRoot }), pmRoot };
}

test('Telegram /today writes context and /done 1 resolves via lastList', async () => {
  const { repo, pmRoot } = await mkRepo();

  const now = new Date('2026-01-31T09:00:00Z'); // 10:00 in Stockholm (+01)

  const taskA: ParsedTaskFile = {
    meta: {
      id: 'TASK-0001',
      title: 'Due today',
      status: 'todo',
      project: 'demo',
      created: now.toISOString(),
      updated: now.toISOString(),
      due: '2026-01-31'
    },
    body: '\n## Context\n\n',
    path: path.join(pmRoot, 'projects', 'demo', 'tasks', 'TASK-0001-due-today.md')
  };

  const taskB: ParsedTaskFile = {
    meta: {
      id: 'TASK-0002',
      title: 'Overdue',
      status: 'doing',
      project: 'demo',
      created: now.toISOString(),
      updated: now.toISOString(),
      due: '2026-01-30'
    },
    body: '\n## Context\n\n',
    path: path.join(pmRoot, 'projects', 'demo', 'tasks', 'TASK-0002-overdue.md')
  };

  await fs.mkdir(path.dirname(taskA.path!), { recursive: true });
  await fs.writeFile(taskA.path!, taskFile(taskA), 'utf8');
  await fs.writeFile(taskB.path!, taskFile(taskB), 'utf8');

  const resToday = await handleTelegramPmMessage(
    repo,
    { chatId: 'c1', messageId: 'm1', text: '/today' },
    { now }
  );

  assert.ok(resToday);
  assert.ok(resToday.text.includes('Просрочено:'));
  assert.ok(resToday.text.includes('Сегодня:'));

  const ctxPath = path.join(pmRoot, '_meta', 'telegram-context.json');
  const ctx = JSON.parse(await fs.readFile(ctxPath, 'utf8'));
  assert.deepEqual(ctx.byChat.c1.lastList.items, ['TASK-0002', 'TASK-0001']);

  const resDone = await handleTelegramPmMessage(
    repo,
    { chatId: 'c1', messageId: 'm2', text: '/done 1' },
    { now }
  );

  assert.ok(resDone);
  assert.ok(resDone.text.includes('TASK-0002'));
  const updated = await repo.findTaskById('TASK-0002');
  assert.equal(updated?.meta.status, 'done');
});

test('Telegram callback pm:v1:snooze:1d sets due to tomorrow when missing', async () => {
  const { repo, pmRoot } = await mkRepo();
  const now = new Date('2026-01-31T09:00:00Z');

  const task: ParsedTaskFile = {
    meta: {
      id: 'TASK-0005',
      title: 'No due',
      status: 'todo',
      project: 'demo',
      created: now.toISOString(),
      updated: now.toISOString()
    },
    body: '\n## Context\n\n',
    path: path.join(pmRoot, 'projects', 'demo', 'tasks', 'TASK-0005-no-due.md')
  };

  await fs.mkdir(path.dirname(task.path!), { recursive: true });
  await fs.writeFile(task.path!, taskFile(task), 'utf8');

  const cbRes = await handleTelegramPmCallback(
    repo,
    { chatId: 'c1', messageId: 'm1', data: 'pm:v1:snooze:1d:TASK-0005' },
    { now }
  );

  assert.ok(cbRes);
  assert.ok(cbRes.toast.includes('due:'));

  const updated = await repo.findTaskById('TASK-0005');
  assert.equal(updated?.meta.due, '2026-02-01');
});
