#!/usr/bin/env node
/**
 * Generate pm/_meta/index.json from task Markdown files on disk.
 *
 * Index fields (per pm/PLAN.md):
 * - id,title,status,project,priority,due,tags,updated,path
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const WORKSPACE_ROOT = process.cwd();
const TASKS_ROOT = path.join(WORKSPACE_ROOT, 'pm', 'projects');
const OUT_PATH = path.join(WORKSPACE_ROOT, 'pm', '_meta', 'index.json');

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function parseInlineArray(v) {
  // Supports: [a, b, "c d"]
  const trimmed = v.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];

  const out = [];
  let cur = '';
  let inQuote = false;
  let quoteChar = null;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];

    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
        quoteChar = null;
      } else if (ch === '\\' && i + 1 < inner.length) {
        // minimal escapes
        const next = inner[++i];
        cur += next;
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
      continue;
    }

    if (ch === ',') {
      const item = cur.trim();
      if (item) out.push(item);
      cur = '';
      continue;
    }

    cur += ch;
  }

  const last = cur.trim();
  if (last) out.push(last);
  return out;
}

function parseScalar(v) {
  const t = v.trim();
  if (t === 'null' || t === '~') return null;
  if (t === 'true') return true;
  if (t === 'false') return false;

  // quoted strings
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }

  // inline arrays
  const arr = parseInlineArray(t);
  if (arr) return arr;

  // number
  if (/^[+-]?\d+(?:\.\d+)?$/.test(t)) return Number(t);

  return t;
}

function parseFrontmatter(md) {
  // Only supports simple YAML used in Task Spec v1: key: value (scalars/inline arrays)
  // Returns { data, body } or null if no frontmatter.
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!m) return null;

  const raw = m[1];
  const data = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // key: value
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const valueRaw = trimmed.slice(idx + 1).trim();

    // ignore complex YAML (multiline, maps) for now
    data[key] = parseScalar(valueRaw);
  }

  const body = md.slice(m[0].length);
  return { data, body };
}

const STATUS_ORDER = ['todo', 'doing', 'blocked', 'done'];
function statusRank(s) {
  const idx = STATUS_ORDER.indexOf(String(s || '').toLowerCase());
  return idx === -1 ? 999 : idx;
}

function priorityRank(p) {
  // P0 highest.
  const m = String(p || '').match(/^P(\d+)$/i);
  return m ? Number(m[1]) : 999;
}

function compareDue(a, b) {
  // nulls last; due is YYYY-MM-DD
  const ad = a ?? null;
  const bd = b ?? null;
  if (ad === bd) return 0;
  if (ad === null) return 1;
  if (bd === null) return -1;
  return ad.localeCompare(bd);
}

function compareUpdatedDesc(a, b) {
  // string timestamps; fall back to lex compare (ISO)
  const au = a ?? '';
  const bu = b ?? '';
  if (au === bu) return 0;
  return bu.localeCompare(au);
}

function stableSort(items) {
  // Stable sorting order for UI:
  // project asc, status (todo/doing/blocked/done), priority (P0..), due asc (null last), updated desc, id asc
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((A, B) => {
      const a = A.item;
      const b = B.item;

      if (a.project !== b.project) return String(a.project || '').localeCompare(String(b.project || ''));
      const sr = statusRank(a.status) - statusRank(b.status);
      if (sr !== 0) return sr;
      const pr = priorityRank(a.priority) - priorityRank(b.priority);
      if (pr !== 0) return pr;
      const dr = compareDue(a.due, b.due);
      if (dr !== 0) return dr;
      const ur = compareUpdatedDesc(a.updated, b.updated);
      if (ur !== 0) return ur;
      const ir = String(a.id || '').localeCompare(String(b.id || ''));
      if (ir !== 0) return ir;
      return A.idx - B.idx;
    })
    .map(({ item }) => item);
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walk(p);
    } else {
      yield p;
    }
  }
}

async function main() {
  // Discover tasks: pm/projects/*/tasks/*.md (recursively, but primarily that).
  const taskFiles = [];
  for await (const p of walk(TASKS_ROOT)) {
    if (!p.endsWith('.md')) continue;
    if (!p.includes(`${path.sep}tasks${path.sep}`)) continue;
    taskFiles.push(p);
  }

  const items = [];
  for (const filePath of taskFiles) {
    const md = await fs.readFile(filePath, 'utf8');
    const fm = parseFrontmatter(md);
    if (!fm) continue;
    const d = fm.data;

    // Minimum required: id, title
    if (!d.id) continue;

    const relPath = toPosix(path.relative(WORKSPACE_ROOT, filePath));

    let tags = d.tags;
    if (typeof tags === 'string') tags = [tags];
    if (!Array.isArray(tags)) tags = [];

    items.push({
      id: String(d.id),
      title: d.title != null ? String(d.title) : '',
      status: d.status != null ? String(d.status) : null,
      project: d.project != null ? String(d.project) : null,
      priority: d.priority != null ? String(d.priority) : null,
      due: d.due != null ? String(d.due) : null,
      tags: tags.map(String),
      updated: d.updated != null ? String(d.updated) : null,
      path: relPath,
    });
  }

  const sorted = stableSort(items);

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(sorted, null, 2) + '\n', 'utf8');

  process.stdout.write(`Generated ${toPosix(path.relative(WORKSPACE_ROOT, OUT_PATH))} with ${sorted.length} tasks.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
