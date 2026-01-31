#!/usr/bin/env node
import process from 'node:process';
import readline from 'node:readline';
import { TaskRepo } from './pm/repo.js';
import { buildKanbanSummary, buildMvpProgress, formatKanbanSummaryText, formatMvpProgressText } from './pm/report.js';
import { bootstrapUser, loadUsers, resolvePmRoot, resolveSecretsRoot, setPassword } from './auth.js';

function usage(): void {
  console.error(`pm CLI\n\nUsage:\n  pm list\n  pm create --project <p> --title <t> [--priority P1] [--due YYYY-MM-DD] [--tag x --tag y]\n  pm set <TASK-0001> status <todo|doing|blocked|done>\n  pm set <TASK-0001> due <YYYY-MM-DD>\n  pm log <TASK-0001> <text>\n  pm index\n  pm status [project]            # Kanban-сводка по статусам\n  pm progress [project]          # MVP прогресс по итерациям (A/B/C)\n  pm mvp [project]               # alias для progress\n  pm bootstrap-user --username <name>\n  pm set-password <username>\n`);
  process.exit(2);
  return;
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
  const pmRoot = resolvePmRoot();
  const repo = new TaskRepo({ pmRoot });

  const [, , cmd, ...rest] = process.argv;
  if (!cmd) return usage();

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
    if (!project || !title) return usage();

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
    if (!id || !field || !value) return usage();

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
    if (!id || !text) return usage();
    await repo.appendLog(id, text);
    return;
  }

  if (cmd === 'index') {
    await repo.writeIndexFile();
    return;
  }

  if (cmd === 'status') {
    const project = rest[0] || 'vextaibot';
    const sum = await buildKanbanSummary(repo, project);
    console.log(formatKanbanSummaryText(sum));
    return;
  }

  if (cmd === 'progress' || cmd === 'mvp') {
    const project = rest[0] || 'vextaibot';
    const iters = await buildMvpProgress(repo, project, { useWeights: true });
    console.log(formatMvpProgressText(iters));
    return;
  }

  if (cmd === 'bootstrap-user') {
    const username = readFlag(rest, '--username');
    if (!username) return usage();
    const { user, created } = await bootstrapUser(pmRoot, username);
    console.log(created ? `created:${user.username}` : `exists:${user.username}`);
    return;
  }

  if (cmd === 'set-password') {
    const username = rest[0];
    if (!username) return usage();
    const users = await loadUsers(pmRoot);
    if (!users.find((u) => u.username === username)) {
      console.error(`Unknown user: ${username}`);
      process.exit(2);
    }
    const password = await promptLine('Password: ');
    const secretsRoot = resolveSecretsRoot();
    await setPassword(secretsRoot, username, password);
    console.log(`updated:${username}`);
    return;
  }

  return usage();
}

async function promptLine(label: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const value = await new Promise<string>((resolve) => rl.question(label, resolve));
  rl.close();
  return value.trim();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
