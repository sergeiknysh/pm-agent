import path from 'node:path';
import { readText, writeText, ensureDir, fileExists } from './fs.js';
import { TaskRepo } from './repo.js';
import type { ParsedTaskFile, TaskStatus } from './types.js';
import { buildKanbanSummary, buildMvpProgress, formatKanbanSummaryText, formatMvpProgressText } from './report.js';

export type TelegramPmCommand = 'add' | 'inbox' | 'today' | 'done' | 'status' | 'progress' | 'mvp';

export interface TelegramMessageLike {
  chatId: string;
  messageId: string;
  text: string;
  replyToText?: string;
}

export interface TelegramCallbackLike {
  chatId: string;
  messageId: string; // message that had the inline keyboard
  callbackId?: string; // telegram callback query id, if available
  data: string; // callback_data
  messageText?: string; // current message text (for editing), if available
}

export interface TelegramInlineButton {
  text: string;
  callback_data: string;
}

export type TelegramInlineKeyboard = TelegramInlineButton[][];

export interface TelegramPmResponse {
  text: string;
  keyboard?: TelegramInlineKeyboard;
  // lastList context written (if any)
  contextWritten?: boolean;
}

export interface TelegramPmCallbackResponse {
  toast: string;
  editText?: string;
  editKeyboard?: TelegramInlineKeyboard;
}

interface TelegramContextFileV1 {
  byChat?: Record<
    string,
    {
      lastList?: {
        created: string;
        source: string;
        items: string[]; // TASK ids
      };
    }
  >;
}

function stockholmYmd(d: Date): string {
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return fmt.format(d);
}

function addDaysYmd(ymd: string, days: number): string {
  // Interpret YYYY-MM-DD as a date in UTC (safe for just day arithmetic).
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function isTaskId(x: string): boolean {
  return /^TASK-\d{4,}$/.test(x);
}

function parseCommand(text: string): { cmd: TelegramPmCommand | null; argText: string } {
  const t = text.trim();
  if (!t.startsWith('/')) return { cmd: null, argText: '' };

  // Telegram can send "/cmd@botname" — strip suffix.
  const [headRaw, ...rest] = t.split(/\s+/);
  const head = headRaw.replace(/^\//, '').split('@')[0];
  const argText = rest.join(' ').trim();

  if (head === 'add' || head === 'inbox' || head === 'today' || head === 'done' || head === 'status' || head === 'progress' || head === 'mvp') {
    return { cmd: head as TelegramPmCommand, argText };
  }

  return { cmd: null, argText: '' };
}

function buildTaskButtons(id: string): TelegramInlineKeyboard {
  return [
    [
      { text: 'ToDo', callback_data: `pm:v1:status:todo:${id}` },
      { text: 'Doing', callback_data: `pm:v1:status:doing:${id}` }
    ],
    [
      { text: 'Done', callback_data: `pm:v1:status:done:${id}` },
      { text: 'Snooze 1d', callback_data: `pm:v1:snooze:1d:${id}` }
    ]
  ];
}

async function loadTelegramContext(pmRoot: string): Promise<TelegramContextFileV1> {
  const metaDir = path.join(pmRoot, '_meta');
  const ctxPath = path.join(metaDir, 'telegram-context.json');
  if (!(await fileExists(ctxPath))) return {};
  try {
    const raw = await readText(ctxPath);
    const parsed = JSON.parse(raw) as TelegramContextFileV1;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveTelegramContext(pmRoot: string, ctx: TelegramContextFileV1): Promise<void> {
  const metaDir = path.join(pmRoot, '_meta');
  await ensureDir(metaDir);
  const ctxPath = path.join(metaDir, 'telegram-context.json');
  await writeText(ctxPath, JSON.stringify(ctx, null, 2) + '\n');
}

async function writeLastList(pmRoot: string, chatId: string, source: string, items: string[], atIso: string): Promise<void> {
  const ctx = await loadTelegramContext(pmRoot);
  ctx.byChat ??= {};
  ctx.byChat[chatId] ??= {};
  ctx.byChat[chatId].lastList = { created: atIso, source, items };
  await saveTelegramContext(pmRoot, ctx);
}

async function resolveIdFromNumber(pmRoot: string, chatId: string, n: number, now: Date): Promise<string | null> {
  const ctx = await loadTelegramContext(pmRoot);
  const entry = ctx.byChat?.[chatId]?.lastList;
  if (!entry) return null;

  // TTL 24h
  const created = new Date(entry.created);
  if (Number.isNaN(created.getTime())) return null;
  if (now.getTime() - created.getTime() > 24 * 60 * 60 * 1000) return null;

  const idx = n - 1;
  if (idx < 0 || idx >= entry.items.length) return null;
  return entry.items[idx] ?? null;
}

function formatTaskLine(t: ParsedTaskFile): string {
  const bits: string[] = [];
  bits.push(`${t.meta.id} — ${t.meta.title}`);
  const tail: string[] = [];
  tail.push(t.meta.status);
  if (t.meta.priority) tail.push(t.meta.priority);
  tail.push(t.meta.project);
  if (t.meta.due) tail.push(`due:${t.meta.due}`);
  return `${bits.join('')} (${tail.join(', ')})`;
}

export async function handleTelegramPmMessage(
  repo: TaskRepo,
  msg: TelegramMessageLike,
  opts?: { now?: Date; inboxTail?: number }
): Promise<TelegramPmResponse | null> {
  const { cmd, argText } = parseCommand(msg.text);
  if (!cmd) return null;

  const now = opts?.now ?? new Date();
  const nowIso = now.toISOString();
  const pmRoot = repo.pmRoot;

  if (cmd === 'add') {
    const text = (argText || msg.replyToText || '').trim();
    if (!text) {
      return { text: 'Использование: /add <текст> (или ответьте /add на сообщение)' };
    }

    const inboxPath = path.join(pmRoot, 'inbox.md');
    if (!(await fileExists(inboxPath))) {
      await writeText(inboxPath, '# Inbox\n\n- \n');
    }

    const entry = `- [ ] ${text}\n  - meta: created=${nowIso}, src=telegram, chat=${msg.chatId}, msg=${msg.messageId}\n`;
    const prev = await readText(inboxPath);
    const next = prev.replace(/\n?$/, '\n') + '\n' + entry;
    await writeText(inboxPath, next);

    return { text: `Добавлено во входящие: “${text}”` };
  }

  if (cmd === 'inbox') {
    const inboxPath = path.join(pmRoot, 'inbox.md');
    if (!(await fileExists(inboxPath))) return { text: 'Inbox пуст.' };
    const md = await readText(inboxPath);
    const lines = md.split(/\r?\n/);

    // Collect unchecked bullets, ignore meta lines.
    const items: string[] = [];
    for (const line of lines) {
      const m = /^- \[ \] (.+)$/.exec(line.trimEnd());
      if (m) items.push(m[1].trim());
    }

    const tailN = opts?.inboxTail ?? 15;
    const tail = items.slice(-tailN);
    if (!tail.length) return { text: 'Inbox пуст.' };

    const out = ['Inbox (последние):', ...tail.map((t, i) => `${i + 1}) ${t}`)].join('\n');
    // Note: no TASK ids here, so we do not write lastList.
    return { text: out };
  }

  if (cmd === 'today') {
    const today = stockholmYmd(now);
    const tasks = await repo.loadAllTasks();

    const active = tasks.filter((t) => t.meta.status !== 'done');
    const overdue = active.filter((t) => t.meta.due && t.meta.due < today);
    const dueToday = active.filter((t) => t.meta.due === today);
    const doing = active.filter((t) => t.meta.status === 'doing' && (!t.meta.due || t.meta.due > today));

    const lines: string[] = [];
    const listed: ParsedTaskFile[] = [];

    if (overdue.length) {
      lines.push('Просрочено:');
      for (const t of overdue.sort((a, b) => (a.meta.due ?? '').localeCompare(b.meta.due ?? ''))) {
        lines.push(`- ${formatTaskLine(t)}`);
        listed.push(t);
      }
      lines.push('');
    }

    if (dueToday.length) {
      lines.push('Сегодня:');
      for (const t of dueToday.sort((a, b) => a.meta.updated.localeCompare(b.meta.updated))) {
        lines.push(`- ${formatTaskLine(t)}`);
        listed.push(t);
      }
      lines.push('');
    }

    if (doing.length) {
      lines.push('Doing:');
      for (const t of doing.sort((a, b) => a.meta.updated.localeCompare(b.meta.updated))) {
        lines.push(`- ${formatTaskLine(t)}`);
        // Only add if not already listed above
        if (!listed.find((x) => x.meta.id === t.meta.id)) listed.push(t);
      }
    }

    if (!lines.length) {
      return { text: `На сегодня пусто (today=${today}).` };
    }

    const ids = listed.map((t) => t.meta.id);
    await writeLastList(pmRoot, msg.chatId, 'today', ids, nowIso);

    // MVP keyboard: if exactly one task, attach per-message keyboard.
    // For multiple tasks, OpenClaw/Telegram needs per-item keyboards; keep it simple and omit here.
    if (ids.length === 1) {
      return { text: lines.join('\n').trimEnd(), keyboard: buildTaskButtons(ids[0]), contextWritten: true };
    }

    return { text: lines.join('\n').trimEnd(), contextWritten: true };
  }

  if (cmd === 'status') {
    const project = (argText || 'vextaibot').trim() || 'vextaibot';
    const sum = await buildKanbanSummary(repo, project);
    return { text: formatKanbanSummaryText(sum) };
  }

  if (cmd === 'progress' || cmd === 'mvp') {
    const project = (argText || 'vextaibot').trim() || 'vextaibot';
    const iters = await buildMvpProgress(repo, project, { useWeights: true });
    return { text: formatMvpProgressText(iters) };
  }

  if (cmd === 'done') {
    const raw = (argText || '').trim();
    let id: string | null = null;

    if (raw && isTaskId(raw)) {
      id = raw;
    } else if (raw && /^\d+$/.test(raw)) {
      id = await resolveIdFromNumber(pmRoot, msg.chatId, Number(raw), now);
    } else {
      // try to extract TASK-XXXX from replied-to text
      const src = msg.replyToText || msg.text;
      const m = /\b(TASK-\d{4,})\b/.exec(src);
      if (m) id = m[1];
    }

    if (!id) {
      return { text: 'Не понял какую задачу закрыть. Использование: /done TASK-0007 или /done 2 (из последнего /today).' };
    }

    const task = await repo.findTaskById(id);
    if (!task) return { text: `Не нашёл задачу: ${id}` };

    await repo.updateTaskMeta(id, { status: 'done' });
    return { text: `Готово: ${id} — ${task.meta.title}` };
  }

  return null;
}

export async function handleTelegramPmCallback(
  repo: TaskRepo,
  cb: TelegramCallbackLike,
  opts?: { now?: Date }
): Promise<TelegramPmCallbackResponse | null> {
  if (!cb.data.startsWith('pm:v1:')) return null;
  const now = opts?.now ?? new Date();

  const parts = cb.data.split(':');
  // pm:v1:status:<todo|doing|done>:<TASK-XXXX>
  // pm:v1:snooze:1d:<TASK-XXXX>
  if (parts.length < 5) return { toast: 'Некорректная кнопка.' };

  const kind = parts[2];

  if (kind === 'status') {
    const status = parts[3] as TaskStatus;
    const id = parts[4] ?? '';
    if (!isTaskId(id)) return { toast: 'Некорректная задача.' };
    if (!['todo', 'doing', 'done'].includes(status)) return { toast: 'Некорректный статус.' };

    const task = await repo.findTaskById(id);
    if (!task) return { toast: `Не нашёл ${id}` };

    await repo.updateTaskMeta(id, { status });

    const updated = await repo.findTaskById(id);
    const line = updated ? formatTaskLine(updated) : formatTaskLine({ ...task, meta: { ...task.meta, status } });

    // If the message contains the id, do a best-effort inline edit by replacing that line.
    const editText = cb.messageText && cb.messageText.includes(id)
      ? cb.messageText.replace(new RegExp(`(^|\\n)-?\\s*${id}[^\\n]*`, 'm'), (m) => {
          // preserve bullet if present
          const prefix = m.trimStart().startsWith('-') ? '- ' : '';
          const lead = m.startsWith('\n') ? '\n' : '';
          return `${lead}${prefix}${line}`;
        })
      : undefined;

    return {
      toast: `OK: ${id} → ${status}`,
      editText,
      editKeyboard: buildTaskButtons(id)
    };
  }

  if (kind === 'snooze') {
    const amount = parts[3];
    const id = parts[4] ?? '';
    if (amount !== '1d') return { toast: 'Некорректный snooze.' };
    if (!isTaskId(id)) return { toast: 'Некорректная задача.' };

    const task = await repo.findTaskById(id);
    if (!task) return { toast: `Не нашёл ${id}` };

    const tomorrow = addDaysYmd(stockholmYmd(now), 1);
    const due = task.meta.due ? addDaysYmd(task.meta.due, 1) : tomorrow;
    const nextDue = due < tomorrow ? tomorrow : due;

    await repo.updateTaskMeta(id, { due: nextDue });

    const updated = await repo.findTaskById(id);
    const line = updated ? formatTaskLine(updated) : formatTaskLine({ ...task, meta: { ...task.meta, due: nextDue } });

    const editText = cb.messageText && cb.messageText.includes(id)
      ? cb.messageText.replace(new RegExp(`(^|\\n)-?\\s*${id}[^\\n]*`, 'm'), (m) => {
          const prefix = m.trimStart().startsWith('-') ? '- ' : '';
          const lead = m.startsWith('\n') ? '\n' : '';
          return `${lead}${prefix}${line}`;
        })
      : undefined;

    return {
      toast: `Snoozed: ${id} → due:${nextDue}`,
      editText,
      editKeyboard: buildTaskButtons(id)
    };
  }

  return { toast: 'Неизвестное действие.' };
}
