import type { ParsedTaskFile, TaskPriority, TaskStatus } from './types.js';
import type { TaskRepo } from './repo.js';

export interface KanbanStatusCounts {
  todo: number;
  doing: number;
  blocked: number;
  done: number;
}

export interface KanbanSummary {
  project: string;
  counts: KanbanStatusCounts;
  top: ParsedTaskFile[];
}

export interface MvpIterationProgress {
  name: string;
  key: string;
  percent: number; // 0..100
  total: number;
  done: number;
  tasks: ParsedTaskFile[];
  remaining: ParsedTaskFile[];
}

function priorityRank(p?: TaskPriority | null): number {
  const m = String(p ?? '').match(/^P(\d+)$/i);
  return m ? Number(m[1]) : 999;
}

function statusRank(s?: TaskStatus): number {
  const order: TaskStatus[] = ['doing', 'blocked', 'todo', 'done'];
  const idx = order.indexOf((s ?? '') as TaskStatus);
  return idx === -1 ? 999 : idx;
}

function scoreStatus(s: TaskStatus): number {
  // Simple weighted progress score.
  // done counts fully; doing partially; blocked small partial.
  if (s === 'done') return 1;
  if (s === 'doing') return 0.5;
  if (s === 'blocked') return 0.25;
  return 0;
}

function fmtPercent(x: number): number {
  // Keep it stable and readable.
  return Math.max(0, Math.min(100, Math.round(x)));
}

export async function buildKanbanSummary(repo: TaskRepo, project: string, opts?: { topN?: number }): Promise<KanbanSummary> {
  const tasks = (await repo.loadAllTasks()).filter((t) => t.meta.project === project);
  const counts: KanbanStatusCounts = { todo: 0, doing: 0, blocked: 0, done: 0 };
  for (const t of tasks) {
    if (t.meta.status === 'todo') counts.todo++;
    else if (t.meta.status === 'doing') counts.doing++;
    else if (t.meta.status === 'blocked') counts.blocked++;
    else if (t.meta.status === 'done') counts.done++;
  }

  const topN = opts?.topN ?? 5;
  const top = tasks
    .filter((t) => t.meta.status !== 'done')
    .slice()
    .sort((a, b) => {
      const pr = priorityRank(a.meta.priority) - priorityRank(b.meta.priority);
      if (pr !== 0) return pr;
      // due earlier first (nulls last)
      const ad = a.meta.due ?? null;
      const bd = b.meta.due ?? null;
      if (ad !== bd) {
        if (ad === null) return 1;
        if (bd === null) return -1;
        const dr = ad.localeCompare(bd);
        if (dr !== 0) return dr;
      }
      const sr = statusRank(a.meta.status) - statusRank(b.meta.status);
      if (sr !== 0) return sr;
      return a.meta.id.localeCompare(b.meta.id);
    })
    .slice(0, topN);

  return { project, counts, top };
}

const MVP_VEXTAIBOT: Array<{ key: string; name: string; ids: string[] }> = [
  {
    key: 'A',
    name: 'Iteration A (Files+Commands)',
    ids: ['TASK-0001', 'TASK-0002', 'TASK-0003', 'TASK-0004', 'TASK-0005']
  },
  {
    key: 'B',
    name: 'Iteration B (Telegram)',
    ids: ['TASK-0006', 'TASK-0007']
  },
  {
    key: 'C',
    name: 'Iteration C (Web UI)',
    ids: ['TASK-0008', 'TASK-0009']
  }
];

export async function buildMvpProgress(
  repo: TaskRepo,
  project: string,
  opts?: { useWeights?: boolean }
): Promise<MvpIterationProgress[]> {
  const tasks = (await repo.loadAllTasks()).filter((t) => t.meta.project === project);
  const byId = new Map(tasks.map((t) => [t.meta.id, t] as const));

  // v1: only one hardcoded mapping for now.
  const mapping = project === 'vextaibot' ? MVP_VEXTAIBOT : [];

  return mapping.map((iter) => {
    const iterTasks = iter.ids.map((id) => byId.get(id)).filter(Boolean) as ParsedTaskFile[];
    const total = iterTasks.length;
    const done = iterTasks.filter((t) => t.meta.status === 'done').length;

    let pct: number;
    if (!total) {
      pct = 0;
    } else if (opts?.useWeights) {
      const score = iterTasks.reduce((sum, t) => sum + scoreStatus(t.meta.status), 0);
      pct = (score / total) * 100;
    } else {
      pct = (done / total) * 100;
    }

    const remaining = iterTasks
      .filter((t) => t.meta.status !== 'done')
      .slice()
      .sort((a, b) => {
        const sr = statusRank(a.meta.status) - statusRank(b.meta.status);
        if (sr !== 0) return sr;
        const pr = priorityRank(a.meta.priority) - priorityRank(b.meta.priority);
        if (pr !== 0) return pr;
        return a.meta.id.localeCompare(b.meta.id);
      });

    return {
      name: iter.name,
      key: iter.key,
      percent: fmtPercent(pct),
      total,
      done,
      tasks: iterTasks,
      remaining
    };
  });
}

export function formatKanbanSummaryText(sum: KanbanSummary): string {
  const lines: string[] = [];
  lines.push(`Kanban: ${sum.project}`);
  lines.push(`TODO: ${sum.counts.todo} | DOING: ${sum.counts.doing} | BLOCKED: ${sum.counts.blocked} | DONE: ${sum.counts.done}`);

  if (sum.top.length) {
    lines.push('');
    lines.push('Топ-приоритеты:');
    for (const t of sum.top) {
      const bits: string[] = [];
      bits.push(`${t.meta.id} — ${t.meta.title}`);
      const tail: string[] = [];
      tail.push(t.meta.status);
      if (t.meta.priority) tail.push(t.meta.priority);
      if (t.meta.due) tail.push(`due:${t.meta.due}`);
      lines.push(`- ${bits.join('')} (${tail.join(', ')})`);
    }
  }

  return lines.join('\n');
}

export function formatMvpProgressText(iters: MvpIterationProgress[]): string {
  if (!iters.length) return 'MVP progress: нет данных по итерациям для этого проекта.';
  const lines: string[] = [];
  lines.push('MVP progress:');
  for (const it of iters) {
    lines.push(`- ${it.key}: ${it.percent}% (${it.done}/${it.total}) — ${it.name}`);
    if (it.remaining.length) {
      for (const t of it.remaining.slice(0, 5)) {
        const tail: string[] = [t.meta.status];
        if (t.meta.priority) tail.push(t.meta.priority);
        if (t.meta.due) tail.push(`due:${t.meta.due}`);
        lines.push(`  - осталось: ${t.meta.id} — ${t.meta.title} (${tail.join(', ')})`);
      }
      if (it.remaining.length > 5) {
        lines.push(`  - …и ещё ${it.remaining.length - 5}`);
      }
    }
  }
  return lines.join('\n');
}
