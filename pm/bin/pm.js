#!/usr/bin/env node
/**
 * PM-as-Files CLI (minimal, no deps)
 *
 * Commands:
 *   pm inbox add <text>
 *   pm inbox triage [--project <name>] [--non-interactive] [--yes]
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const INBOX_PATH = path.join(ROOT, 'inbox.md');
const PROJECTS_DIR = path.join(ROOT, 'projects');

function nowIso() {
  return new Date().toISOString();
}

function die(msg, code = 1) {
  process.stderr.write(String(msg) + '\n');
  process.exit(code);
}

function readText(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

function writeText(p, s) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s, 'utf8');
}

function normalizeLineText(s) {
  return String(s)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .toLowerCase();
}

function slugify(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04FF]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'task';
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (key === 'non-interactive' || key === 'yes' || key === 'dry-run') {
        out[key] = true;
      } else {
        const v = argv[++i];
        if (v == null) die(`Missing value for --${key}`);
        out[key] = v;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function ensureInboxExists() {
  if (!fs.existsSync(INBOX_PATH)) {
    writeText(
      INBOX_PATH,
      `# Inbox\n\n> Быстрые входящие. Пиши сюда сырые мысли/задачи. Потом запускай triage.\n\n- \n`
    );
  }
}

function appendInboxLine(text) {
  ensureInboxExists();
  const content = readText(INBOX_PATH);
  const lines = content.split(/\r?\n/);

  // Append to the end. Keep a blank bullet at the bottom if it exists.
  const trimmed = String(text || '').trim();
  if (!trimmed) die('Nothing to add');

  // If file ends with "-" (empty bullet), replace it.
  const lastNonEmptyIdx = (() => {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() !== '') return i;
    }
    return -1;
  })();

  const emptyBulletIdx = (() => {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/^\s*-\s*$/.test(lines[i])) return i;
      if (lines[i].trim() !== '') break;
    }
    return -1;
  })();

  if (emptyBulletIdx !== -1) {
    lines[emptyBulletIdx] = `- ${trimmed}`;
    // Re-add empty bullet at the end for convenience
    lines.push('- ');
  } else {
    const insertAt = lastNonEmptyIdx + 1;
    lines.splice(insertAt, 0, `- ${trimmed}`);
    lines.push('- ');
  }

  writeText(INBOX_PATH, lines.join('\n'));
}

function parseInboxBullets(md) {
  const lines = md.split(/\r?\n/);
  const items = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^\s*-\s*(?:\[(?<check>[ xX])\]\s*)?(?<text>.*?)\s*$/);
    if (!m) continue;

    const text = (m.groups?.text || '').trim();
    if (!text) continue;

    const check = (m.groups?.check || '').trim();
    const checked = check.toLowerCase() === 'x';

    const hasTaskId = /\bTASK-\d{4,}\b/.test(text);

    items.push({
      lineIndex: i,
      raw: line,
      text,
      checked: checked || hasTaskId,
    });
  }

  return { lines, items };
}

function parseInlineHints(text) {
  // Very simple parser for inline hints.
  // Examples:
  //   "@vextaibot Fix inbox triage P0 #inbox due:2026-02-01"
  const tokens = String(text || '').trim().split(/\s+/).filter(Boolean);
  const meta = { project: null, priority: null, due: null, tags: [], cleanText: '' };
  const tags = [];
  const kept = [];

  for (const t of tokens) {
    let consumed = false;

    if (!meta.project) {
      const m1 = t.match(/^@([a-z0-9_-]+)$/i);
      const m2 = t.match(/^p:([a-z0-9_-]+)$/i);
      if (m1) {
        meta.project = m1[1];
        consumed = true;
      } else if (m2) {
        meta.project = m2[1];
        consumed = true;
      }
    }

    if (!consumed && !meta.priority) {
      const mp = t.match(/^(P[0-3])$/i);
      if (mp) {
        meta.priority = mp[1].toUpperCase();
        consumed = true;
      }
    }

    if (!consumed && !meta.due) {
      const md = t.match(/^due:(\d{4}-\d{2}-\d{2})$/i);
      if (md) {
        meta.due = md[1];
        consumed = true;
      }
    }

    if (!consumed) {
      const mt = t.match(/^#([a-z0-9_-]+)$/i);
      if (mt) {
        tags.push(mt[1]);
        consumed = true;
      }
    }

    if (!consumed) kept.push(t);
  }

  meta.tags = Array.from(new Set(tags));
  meta.cleanText = kept.join(' ').trim();
  return meta;
}

function listExistingTasks(project) {
  const tasksDir = path.join(PROJECTS_DIR, project, 'tasks');
  if (!fs.existsSync(tasksDir)) return [];
  const files = fs.readdirSync(tasksDir).filter(f => f.endsWith('.md'));
  const tasks = [];

  for (const f of files) {
    const p = path.join(tasksDir, f);
    const md = readText(p);
    const id = (md.match(/^id:\s*(TASK-\d+)\s*$/m) || [])[1] || null;
    const title = (md.match(/^title:\s*"([\s\S]*?)"\s*$/m) || [])[1] || null;
    if (id || title) tasks.push({ id, title, path: p });
  }
  return tasks;
}

function nextTaskId(project) {
  const existing = listExistingTasks(project);
  let max = 0;
  for (const t of existing) {
    const m = (t.id || '').match(/^TASK-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const n = max + 1;
  return `TASK-${String(n).padStart(4, '0')}`;
}

function taskFilePath(project, id, title) {
  const tasksDir = path.join(PROJECTS_DIR, project, 'tasks');
  const slug = slugify(title);
  return path.join(tasksDir, `${id}-${slug}.md`);
}

function renderTaskMd({ id, title, project, status, priority, tags, due, estimate }) {
  const created = nowIso();
  const updated = created;
  const tagList = Array.isArray(tags) ? tags : [];

  const fm = [
    '---',
    `id: ${id}`,
    `title: "${String(title).replace(/"/g, '\\"')}"`,
    `status: ${status || 'todo'}`,
    `project: ${project}`,
    priority ? `priority: ${priority}` : null,
    tagList.length ? `tags: [${tagList.join(', ')}]` : 'tags: []',
    due ? `due: ${due}` : null,
    estimate ? `estimate: ${estimate}` : null,
    `created: ${created}`,
    `updated: ${updated}`,
    '---',
    '',
    '## Контекст',
    '',
    '- ',
    '',
    '## Чеклист',
    '',
    '- [ ] ',
    '',
    '## Лог',
    `- ${created}: создано из inbox`,
    '',
  ].filter(Boolean);

  return fm.join('\n');
}

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function triageInbox(opts) {
  ensureInboxExists();
  const md = readText(INBOX_PATH);
  const { lines, items } = parseInboxBullets(md);

  const pending = items.filter(it => !it.checked);
  if (!pending.length) {
    process.stdout.write('Inbox: nothing to triage\n');
    return;
  }

  // Preload existing tasks titles for dedupe.
  const existingByProject = new Map();
  const titleSetGlobal = new Set();

  function getProjectTasks(proj) {
    if (!existingByProject.has(proj)) {
      const tasks = listExistingTasks(proj);
      existingByProject.set(proj, tasks);
      for (const t of tasks) {
        if (t.title) titleSetGlobal.add(normalizeLineText(t.title));
      }
    }
    return existingByProject.get(proj);
  }

  const created = [];
  const seenInboxNorm = new Set();

  for (const it of pending) {
    const hints = parseInlineHints(it.text);
    const cleanedTitle = hints.cleanText || it.text;
    const project = opts.project || hints.project || 'vextaibot';

    // Validate project path exists
    const projDir = path.join(PROJECTS_DIR, project);
    if (!fs.existsSync(projDir)) {
      if (opts['non-interactive']) {
        process.stderr.write(`Skip: project does not exist: ${project} (line: ${it.text})\n`);
        continue;
      }
      const ans = (await prompt(`Project "${project}" doesn't exist. Enter project name (or blank to skip): `)).trim();
      if (!ans) continue;
      if (!fs.existsSync(path.join(PROJECTS_DIR, ans))) {
        process.stderr.write(`Skip: project still does not exist: ${ans}\n`);
        continue;
      }
      opts.project = ans;
    }

    const norm = normalizeLineText(cleanedTitle);
    if (seenInboxNorm.has(norm)) {
      // duplicate within inbox run
      continue;
    }
    seenInboxNorm.add(norm);

    // Dedupe against existing task titles
    getProjectTasks(project);
    if (titleSetGlobal.has(norm)) {
      // Mark as triaged without creating a new task
      lines[it.lineIndex] = `- [x] ${it.text} (duplicate)`;
      continue;
    }

    let priority = opts.priority || hints.priority || null;
    let due = opts.due || hints.due || null;
    let tags = [];
    if (opts.tags) {
      tags = String(opts.tags)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    }
    tags = Array.from(new Set([...(hints.tags || []), ...tags]));

    if (!opts['non-interactive'] && !opts.yes) {
      const q = `Triage: "${it.text}"\n  project=${project} priority=${priority || '-'} due=${due || '-'} tags=${tags.join(',') || '-'}\nCreate task? [Y/n] `;
      const ans = (await prompt(q)).trim().toLowerCase();
      if (ans === 'n' || ans === 'no') continue;

      if (!priority) {
        const p = (await prompt('  priority (P0..P3 or blank): ')).trim().toUpperCase();
        if (/^P[0-3]$/.test(p)) priority = p;
      }
      if (!due) {
        const d = (await prompt('  due (YYYY-MM-DD or blank): ')).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) due = d;
      }
      if (!tags.length) {
        const t = (await prompt('  tags (comma-separated or blank): ')).trim();
        if (t) tags = Array.from(new Set(t.split(',').map(x => x.trim()).filter(Boolean)));
      }
    }

    const id = nextTaskId(project);
    const title = cleanedTitle;
    const outPath = taskFilePath(project, id, title);

    const taskMd = renderTaskMd({
      id,
      title,
      project,
      status: opts.status || 'todo',
      priority,
      tags,
      due,
      estimate: opts.estimate || null,
    });

    if (opts['dry-run']) {
      process.stdout.write(`[dry-run] would write ${outPath}\n`);
    } else {
      writeText(outPath, taskMd);
    }

    titleSetGlobal.add(norm);
    created.push({ id, title, project, path: outPath });

    // Mark as triaged in inbox
    lines[it.lineIndex] = `- [x] ${it.text} (→ ${id})`;
  }

  if (!opts['dry-run']) {
    writeText(INBOX_PATH, lines.join('\n'));
  }

  process.stdout.write(`Created ${created.length} task(s)\n`);
  for (const t of created) {
    process.stdout.write(`- ${t.id} [${t.project}] ${t.title}\n`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const [cmd, subcmd, ...rest] = args._;

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    process.stdout.write(
      [
        'pm (PM-as-Files CLI)',
        '',
        'Usage:',
        '  pm inbox add <text>',
        '  pm inbox triage [--project <name>] [--priority P1] [--due YYYY-MM-DD] [--tags a,b] [--status todo]',
        '                 [--non-interactive] [--yes] [--dry-run]',
        '',
        'Notes:',
        '  - triage parses bullet lines from pm/inbox.md',
        '  - inline hints supported: @project, p:project, #tag, P0..P3, due:YYYY-MM-DD',
        '',
      ].join('\n')
    );
    return;
  }

  if (cmd === 'inbox' && subcmd === 'add') {
    const text = rest.join(' ').trim();
    appendInboxLine(text);
    return;
  }

  if (cmd === 'inbox' && subcmd === 'triage') {
    await triageInbox(args);
    return;
  }

  die(`Unknown command: ${cmd} ${subcmd || ''}`.trim());
}

main().catch(err => {
  process.stderr.write((err && err.stack) ? err.stack + '\n' : String(err) + '\n');
  process.exit(1);
});
