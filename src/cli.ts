#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { TaskRepo } from './pm/repo.js';

function usage(): never {
  console.error(`pm CLI\n\nUsage:\n  pm list\n  pm create --project <p> --title <t> [--priority P1] [--due YYYY-MM-DD] [--tag x --tag y]\n  pm set <TASK-0001> status <todo|doing|blocked|done>\n  pm set <TASK-0001> due <YYYY-MM-DD>\n  pm log <TASK-0001> <text>\n  pm index\n`);
  process.exit(2);
}

function readFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function readMultiFlag(args: string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name && args[i + 1]) out.push(args[i + 1]);
  }
  return out;
}

async function main() {
  const cwd = process.cwd();
  const pmRoot = path.join(cwd, 'pm');
  const repo = new TaskRepo({ pmRoot });

  const [, , cmd, ...rest] = process.argv;
  if (!cmd) usage();

  if (cmd === 'list') {
    const tasks = await repo.loadAllTasks();
    for (const t of tasks) {
      console.log(`${t.meta.id}\t${t.meta.status}\t${t.meta.project}\t${t.meta.title}`);
    }
    return;
  }

  if (cmd === 'create') {
    const project = readFlag(rest, '--project');
    const title = readFlag(rest, '--title');
    if (!project || !title) usage();

    const priority = readFlag(rest, '--priority') as any;
    const due = readFlag(rest, '--due');
    const tags = readMultiFlag(rest, '--tag');

    const task = await repo.createTask({ project, title, priority, due, tags: tags.length ? tags : undefined });
    console.log(task.meta.id);
    return;
  }

  if (cmd === 'set') {
    const id = rest[0];
    const field = rest[1];
    const value = rest[2];
    if (!id || !field || !value) usage();

    if (field === 'status') {
      await repo.updateTaskMeta(id, { status: value as any });
      return;
    }
    if (field === 'due') {
      await repo.updateTaskMeta(id, { due: value });
      return;
    }
    usage();
  }

  if (cmd === 'log') {
    const id = rest[0];
    const text = rest.slice(1).join(' ');
    if (!id || !text) usage();
    await repo.appendLog(id, text);
    return;
  }

  if (cmd === 'index') {
    await repo.writeIndexFile();
    return;
  }

  usage();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
