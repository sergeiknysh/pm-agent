import { parseFrontmatter, stringifyFrontmatter } from './frontmatter.js';
import type { ParsedTaskFile, TaskFrontmatterV1, TaskPriority, TaskStatus } from './types.js';

const STATUS_VALUES: TaskStatus[] = ['todo', 'doing', 'blocked', 'done'];
const PRIORITY_VALUES: TaskPriority[] = ['P0', 'P1', 'P2', 'P3'];

export function nowIso(): string {
  return new Date().toISOString();
}

function isString(x: unknown): x is string {
  return typeof x === 'string';
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every(isString);
}

export function validateTaskV1(meta: Record<string, unknown>): TaskFrontmatterV1 {
  const id = meta.id;
  const title = meta.title;
  const status = meta.status;
  const project = meta.project;
  const created = meta.created;
  const updated = meta.updated;

  if (!isString(id) || !/^TASK-\d{4,}$/.test(id)) throw new Error(`Invalid task id: ${String(id)}`);
  if (!isString(title) || title.trim() === '') throw new Error('Task title is required');
  if (!isString(status) || !STATUS_VALUES.includes(status as TaskStatus)) throw new Error(`Invalid status: ${String(status)}`);
  if (!isString(project) || project.trim() === '') throw new Error('Task project is required');
  if (!isString(created)) throw new Error('Task created is required (ISO string)');
  if (!isString(updated)) throw new Error('Task updated is required (ISO string)');

  const out: TaskFrontmatterV1 = {
    id,
    title,
    status: status as TaskStatus,
    project,
    created,
    updated
  };

  if (meta.priority !== undefined) {
    if (!isString(meta.priority) || !PRIORITY_VALUES.includes(meta.priority as TaskPriority)) {
      throw new Error(`Invalid priority: ${String(meta.priority)}`);
    }
    out.priority = meta.priority as TaskPriority;
  }

  if (meta.tags !== undefined) {
    if (!isStringArray(meta.tags)) throw new Error('tags must be a string[]');
    out.tags = meta.tags;
  }

  if (meta.due !== undefined) {
    if (!isString(meta.due)) throw new Error('due must be a string');
    out.due = meta.due;
  }

  if (meta.estimate !== undefined) {
    if (!isString(meta.estimate)) throw new Error('estimate must be a string');
    out.estimate = meta.estimate;
  }

  if (meta.links !== undefined) {
    if (typeof meta.links !== 'object' || meta.links === null) throw new Error('links must be an object');
    out.links = meta.links as Record<string, unknown>;
  }

  return out;
}

export function parseTaskMarkdown(markdown: string, path?: string): ParsedTaskFile {
  const { data, body } = parseFrontmatter(markdown);
  const meta = validateTaskV1(data);
  return { meta, body, path };
}

export function serializeTaskFile(task: ParsedTaskFile): string {
  return `${stringifyFrontmatter(task.meta as unknown as Record<string, unknown>)}${task.body.replace(/^\n?/, '\n')}`;
}

export function applyTaskPatch(
  task: ParsedTaskFile,
  patch: Partial<Pick<TaskFrontmatterV1, 'status' | 'due' | 'tags' | 'priority' | 'title'>> & { project?: string; body?: string }
): ParsedTaskFile {
  const next: ParsedTaskFile = {
    ...task,
    meta: { ...task.meta }
  };

  if (patch.title !== undefined) next.meta.title = patch.title;
  if (patch.project !== undefined) next.meta.project = patch.project;
  if (patch.status !== undefined) next.meta.status = patch.status;
  if (patch.due !== undefined) next.meta.due = patch.due;
  if (patch.priority !== undefined) next.meta.priority = patch.priority;
  if (patch.tags !== undefined) next.meta.tags = patch.tags;
  if (patch.body !== undefined) next.body = patch.body;

  next.meta.updated = nowIso();
  return next;
}

export function appendTaskLog(body: string, entry: string, at: string = nowIso()): string {
  const normalized = body.replace(/\r\n/g, '\n');
  const logHeader = '## Log';
  const line = `- ${at} ${entry}`;

  if (normalized.includes(`\n${logHeader}\n`)) {
    // Insert after header.
    return normalized.replace(
      new RegExp(`\\n${logHeader}\\n`),
      `\n${logHeader}\n${line}\n`
    );
  }

  const trimmed = normalized.trimEnd();
  return `${trimmed}\n\n${logHeader}\n${line}\n`;
}
