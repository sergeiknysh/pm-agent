import path from 'node:path';
import { walkFiles, readText, writeText, ensureDir, fileExists } from './fs.js';
import { parseTaskMarkdown, serializeTaskFile, applyTaskPatch, appendTaskLog, nowIso } from './task.js';
import type { ParsedTaskFile, TaskFrontmatterV1, TaskPriority, TaskStatus } from './types.js';

export interface TaskRepoOptions {
  pmRoot: string; // path to pm/
}

export interface CreateTaskInput {
  title: string;
  project: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  tags?: string[];
  due?: string;
  estimate?: string;
  body?: string;
}

export interface TaskIndexEntry {
  id: string;
  title: string;
  status: TaskStatus;
  project: string;
  priority: TaskPriority | null;
  due: string | null;
  tags: string[];
  updated: string;
  path: string;
}

const STATUS_ORDER: TaskStatus[] = ['todo', 'doing', 'blocked', 'done'];
function statusRank(s: TaskStatus | undefined): number {
  const idx = STATUS_ORDER.indexOf((s ?? '') as TaskStatus);
  return idx === -1 ? 999 : idx;
}

function priorityRank(p?: TaskPriority | null): number {
  const m = String(p ?? '').match(/^P(\d+)$/i);
  return m ? Number(m[1]) : 999;
}

function compareDue(a?: string | null, b?: string | null): number {
  // nulls last; due is typically YYYY-MM-DD
  const ad = a ?? null;
  const bd = b ?? null;
  if (ad === bd) return 0;
  if (ad === null) return 1;
  if (bd === null) return -1;
  return ad.localeCompare(bd);
}

function compareUpdatedDesc(a?: string, b?: string): number {
  const au = a ?? '';
  const bu = b ?? '';
  if (au === bu) return 0;
  return bu.localeCompare(au);
}

function stableSortIndex(entries: TaskIndexEntry[]): TaskIndexEntry[] {
  // Stable sorting order for UI:
  // project asc, status (todo/doing/blocked/done), priority (P0..), due asc (null last), updated desc, id asc
  return entries
    .map((item, idx) => ({ item, idx }))
    .sort((A, B) => {
      const a = A.item;
      const b = B.item;

      if (a.project !== b.project) return String(a.project ?? '').localeCompare(String(b.project ?? ''));
      const sr = statusRank(a.status) - statusRank(b.status);
      if (sr !== 0) return sr;
      const pr = priorityRank(a.priority) - priorityRank(b.priority);
      if (pr !== 0) return pr;
      const dr = compareDue(a.due, b.due);
      if (dr !== 0) return dr;
      const ur = compareUpdatedDesc(a.updated, b.updated);
      if (ur !== 0) return ur;
      const ir = String(a.id ?? '').localeCompare(String(b.id ?? ''));
      if (ir !== 0) return ir;
      return A.idx - B.idx;
    })
    .map(({ item }) => item);
}

export class TaskRepo {
  readonly pmRoot: string;
  constructor(opts: TaskRepoOptions) {
    this.pmRoot = opts.pmRoot;
  }

  tasksDirForProject(project: string): string {
    return path.join(this.pmRoot, 'projects', project, 'tasks');
  }

  taskPath(project: string, id: string, title?: string): string {
    const slug = (title ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const filename = slug ? `${id}-${slug}.md` : `${id}.md`;
    return path.join(this.tasksDirForProject(project), filename);
  }

  async loadAllTasks(): Promise<ParsedTaskFile[]> {
    const projectsDir = path.join(this.pmRoot, 'projects');
    if (!(await fileExists(projectsDir))) return [];

    const mdFiles = await walkFiles(projectsDir, (p) => p.endsWith('.md') && p.includes(`${path.sep}tasks${path.sep}`));
    const tasks: ParsedTaskFile[] = [];
    for (const p of mdFiles) {
      const md = await readText(p);
      const parsed = parseTaskMarkdown(md, p);
      tasks.push(parsed);
    }
    return tasks;
  }

  async findTaskById(id: string): Promise<ParsedTaskFile | null> {
    const tasks = await this.loadAllTasks();
    return tasks.find((t) => t.meta.id === id) ?? null;
  }

  async nextTaskId(): Promise<string> {
    const tasks = await this.loadAllTasks();
    let max = 0;
    for (const t of tasks) {
      const m = /^TASK-(\d+)$/.exec(t.meta.id);
      if (!m) continue;
      const n = Number(m[1]);
      if (n > max) max = n;
    }
    const next = max + 1;
    return `TASK-${String(next).padStart(4, '0')}`;
  }

  async createTask(input: CreateTaskInput): Promise<ParsedTaskFile> {
    const id = await this.nextTaskId();
    const at = nowIso();

    const meta: TaskFrontmatterV1 = {
      id,
      title: input.title,
      project: input.project,
      status: input.status ?? 'todo',
      created: at,
      updated: at,
      priority: input.priority,
      tags: input.tags,
      due: input.due,
      estimate: input.estimate
    };

    // Clean undefined keys for nicer YAML
    const cleanMeta = Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined)) as TaskFrontmatterV1;
    const body = input.body ?? `\n## Context\n\n`; // start with a newline

    const task: ParsedTaskFile = { meta: cleanMeta, body };

    const outPath = this.taskPath(input.project, id, input.title);
    await ensureDir(path.dirname(outPath));
    await writeText(outPath, serializeTaskFile(task));
    return { ...task, path: outPath };
  }

  async updateTaskMeta(id: string, patch: Partial<Pick<TaskFrontmatterV1, 'status' | 'due' | 'tags' | 'priority' | 'title'>>): Promise<ParsedTaskFile> {
    const task = await this.findTaskById(id);
    if (!task || !task.path) throw new Error(`Task not found: ${id}`);
    const updated = applyTaskPatch(task, patch);
    await writeText(task.path, serializeTaskFile(updated));
    return updated;
  }

  async appendLog(id: string, entry: string): Promise<ParsedTaskFile> {
    const task = await this.findTaskById(id);
    if (!task || !task.path) throw new Error(`Task not found: ${id}`);

    const next: ParsedTaskFile = {
      ...task,
      meta: { ...task.meta, updated: nowIso() },
      body: appendTaskLog(task.body, entry)
    };

    await writeText(task.path, serializeTaskFile(next));
    return next;
  }

  async buildIndex(): Promise<TaskIndexEntry[]> {
    const tasks = await this.loadAllTasks();
    const entries = tasks
      .filter((t) => !!t.path)
      .map((t) => ({
        id: t.meta.id,
        title: t.meta.title,
        status: t.meta.status,
        project: t.meta.project,
        priority: t.meta.priority ?? null,
        due: t.meta.due ?? null,
        tags: t.meta.tags ?? [],
        updated: t.meta.updated,
        // Keep compatibility with pm/scripts/generate-index.mjs: path is relative to workspace root.
        path: path.relative(path.dirname(this.pmRoot), t.path!)
      }));

    return stableSortIndex(entries);
  }

  async writeIndexFile(): Promise<{ entries: TaskIndexEntry[]; outPath: string }> {
    const entries = await this.buildIndex();
    const metaDir = path.join(this.pmRoot, '_meta');
    await ensureDir(metaDir);
    const outPath = path.join(metaDir, 'index.json');
    await writeText(outPath, JSON.stringify(entries, null, 2) + '\n');
    return { entries, outPath };
  }
}
