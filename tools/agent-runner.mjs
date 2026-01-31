#!/usr/bin/env node
/*
  agent-runner.mjs

  A small orchestrator to run terminal coding agents (codex/claude/gemini) with:
  - provider fallback
  - cooldown/backoff on rate-limit
  - optional git worktree per run

  Usage examples:
    node tools/agent-runner.mjs --task "Auth backend" --branch feat/auth-cookie
    node tools/agent-runner.mjs --task "Implement login UI" --provider codex
    node tools/agent-runner.mjs --task "Review diff" --mode review --provider gemini

  Notes:
  - Designed to be started by OpenClaw via exec (PTY recommended).
  - For Codex/Claude Code, prefer running inside a git worktree.
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const WORKSPACE = process.cwd();
const STATE_PATH = path.join(WORKSPACE, 'tools', 'agent-state.json');
const LOCK_PATH = path.join(WORKSPACE, 'tools', 'agent-lock.json');

// Ensure common Node/NVM global bins are visible even when shells don't source ~/.bashrc.
// This is important for OpenClaw exec sessions.
const NVM_BIN = '/home/sergei/.nvm/versions/node/v22.22.0/bin';
if (process.env.PATH && !process.env.PATH.split(':').includes(NVM_BIN)) {
  process.env.PATH = `${NVM_BIN}:${process.env.PATH}`;
}

function nowIso() {
  return new Date().toISOString();
}

function die(msg, code = 1) {
  process.stderr.write(String(msg) + '\n');
  process.exit(code);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      // boolean flags
      if (key === 'no-worktree' || key === 'dry-run' || key === 'force') {
        out[key] = true;
      } else {
        if (next == null || next.startsWith('--')) die(`Missing value for --${key}`);
        out[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

async function readJson(p, fallback) {
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(p, obj) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

async function tryAcquireLock(lockKey, holder, ttlMinutes, force) {
  const now = Date.now();
  const ttlMs = Math.max(1, ttlMinutes) * 60 * 1000;

  const lock = await readJson(LOCK_PATH, { version: 1, locks: {} });
  lock.locks ||= {};

  const existing = lock.locks[lockKey];
  if (existing) {
    const exp = new Date(existing.expiresAt || 0).getTime();
    const expired = !Number.isFinite(exp) || exp <= now;
    if (!expired && !force) {
      return { ok: false, reason: `locked by ${existing.holder} until ${existing.expiresAt}` };
    }
  }

  const expiresAt = new Date(now + ttlMs).toISOString();
  lock.locks[lockKey] = { holder, acquiredAt: new Date(now).toISOString(), expiresAt };
  await writeJson(LOCK_PATH, lock);
  return { ok: true, expiresAt };
}

async function releaseLock(lockKey, holder) {
  const lock = await readJson(LOCK_PATH, { version: 1, locks: {} });
  lock.locks ||= {};
  const existing = lock.locks[lockKey];
  if (existing && existing.holder === holder) {
    delete lock.locks[lockKey];
    await writeJson(LOCK_PATH, lock);
  }
}

function pickDefaultBranchSlug(task) {
  const slug = String(task)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
  return slug || 'task';
}

function cmdExists(bin) {
  return new Promise((resolve) => {
    const p = spawn('bash', ['-lc', `command -v ${bin} >/dev/null 2>&1`], { stdio: 'ignore' });
    p.on('exit', (code) => resolve(code === 0));
  });
}

async function runBash(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn('bash', ['-lc', cmd], {
      cwd: opts.cwd || WORKSPACE,
      env: { ...process.env, ...(opts.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d.toString('utf8')));
    p.stderr.on('data', (d) => (err += d.toString('utf8')));
    p.on('error', reject);
    p.on('close', (code) => {
      resolve({ code, out, err });
    });
  });
}

function isRateLimitText(s) {
  const t = String(s || '').toLowerCase();
  return (
    t.includes('rate limit') ||
    t.includes('too many requests') ||
    t.includes('try again later') ||
    t.includes('temporarily unavailable') ||
    t.includes('429')
  );
}

function backoffMinutes(prev) {
  // simple exponential backoff: 15, 30, 60, 120 (cap)
  const seq = [15, 30, 60, 120];
  if (!prev) return seq[0];
  for (let i = 0; i < seq.length; i++) {
    if (prev <= seq[i]) return seq[Math.min(i + 1, seq.length - 1)];
  }
  return 120;
}

function addMinutesIso(iso, mins) {
  const d = iso ? new Date(iso) : new Date();
  const dt = new Date(d.getTime() + mins * 60 * 1000);
  return dt.toISOString();
}

async function resolveDefaultBaseRef(preferred) {
  if (preferred && preferred !== 'auto') return preferred;
  // Prefer main if it exists, else master.
  const hasMain = await runBash(`cd ${shell(WORKSPACE)} && git rev-parse --verify main >/dev/null 2>&1`, { cwd: WORKSPACE });
  if (hasMain.code === 0) return 'main';
  const hasMaster = await runBash(`cd ${shell(WORKSPACE)} && git rev-parse --verify master >/dev/null 2>&1`, { cwd: WORKSPACE });
  if (hasMaster.code === 0) return 'master';
  // fallback
  return 'HEAD';
}

async function ensureWorktree(branch, dir, base = 'main') {
  // Create worktree if not present.
  const { code } = await runBash(`cd ${shell(WORKSPACE)} && git worktree list --porcelain | grep -F "worktree ${dir}" >/dev/null 2>&1`, { cwd: WORKSPACE });
  if (code === 0) return;

  await runBash(`cd ${shell(WORKSPACE)} && git fetch --all --prune`, { cwd: WORKSPACE });

  // If branch already exists, attach worktree to it. Otherwise create it off base.
  const exists = await runBash(`cd ${shell(WORKSPACE)} && git show-ref --verify --quiet refs/heads/${branch}`, { cwd: WORKSPACE });
  const cmd = exists.code === 0
    ? `cd ${shell(WORKSPACE)} && git worktree add ${shell(dir)} ${shell(branch)}`
    : `cd ${shell(WORKSPACE)} && git worktree add -b ${shell(branch)} ${shell(dir)} ${shell(base)}`;

  const r = await runBash(cmd, { cwd: WORKSPACE });
  if (r.code !== 0) {
    die(`Failed to create worktree:\n${r.err || r.out}`);
  }
}

function shell(s) {
  // very small shell escape
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function buildPrompt({ task, mode, notes, reviewDiff }) {
  const parts = [];
  parts.push(`Task: ${task}`);
  parts.push('');
  parts.push('Rules:');
  parts.push('- Work in this repository only (current directory).');
  parts.push('- Make small, reviewable commits (1 logical change per commit).');
  parts.push('- After implementing, run: npm test (and fix failures).');
  parts.push('- Do NOT touch secrets outside the repo unless explicitly instructed.');
  parts.push('- If something is ambiguous, choose a safe default and document it.');
  parts.push('');

  if (mode === 'review') {
    parts.push('Mode: REVIEW');
    parts.push('- Do not implement. Only review and propose changes + tests.');

    if (reviewDiff) {
      parts.push('');
      parts.push('Diff to review (git diff):');
      parts.push('```diff');
      parts.push(reviewDiff.trimEnd());
      parts.push('```');
    }
  } else {
    parts.push('Mode: IMPLEMENT');
    parts.push('- Implement end-to-end and verify with tests.');
  }

  if (notes) {
    parts.push('');
    parts.push('Extra notes/context:');
    parts.push(notes);
  }

  parts.push('');
  parts.push('When completely finished, print a short summary + what you ran to verify.');
  parts.push('');
  return parts.join('\n');
}

async function ensureClaudeLocalPermissions(cwd) {
  const dir = path.join(cwd, '.claude');
  const p = path.join(dir, 'settings.local.json');

  const content = {
    permissions: {
      // Allow the CLI to run bash commands and edit/write files inside the repo.
      // This avoids interactive permission prompts.
      allow: ['bash:*', 'read:**/*', 'edit:**/*', 'write:**/*']
    }
  };

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(p, JSON.stringify(content, null, 2) + '\n', 'utf8');
}

function providerCommand(provider, prompt, opts) {
  // opts: { mode }
  const quoted = prompt.replace(/'/g, `'\\''`);

  if (provider === 'codex') {
    // Worktrees require writing into the main repo's .git/worktrees/* directory.
    // The default sandbox (workspace-write) may block that, so we use a more permissive sandbox.
    // NOTE: This assumes you're running in a trusted local environment.
    return `codex --ask-for-approval never --sandbox danger-full-access exec '${quoted}'`;
  }

  if (provider === 'claude') {
    return `claude '${quoted}'`;
  }

  if (provider === 'gemini') {
    // Assumes gemini CLI supports -p for prompt (many do). If yours differs, adjust here.
    // Keep it single-turn by default.
    return `gemini -p '${quoted}'`;
  }

  die(`Unknown provider: ${provider}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const task = args.task || args.t;
  if (!task) {
    die(
      [
        'Usage: node tools/agent-runner.mjs --task "..." [--provider codex|claude|gemini] [--mode implement|review] [--branch name] [--workdir /tmp/... ] [--base auto|main|master] [--no-worktree] [--notes "..."] [--review-diff auto|<baseRef>] [--force]',
        '',
        'Examples:',
        '  node tools/agent-runner.mjs --task "Auth backend"',
        '  node tools/agent-runner.mjs --task "Review feat/auth" --mode review --provider gemini --no-worktree',
        ''
      ].join('\n')
    );
  }

  const mode = (args.mode || 'implement').toString();
  const providerPref = args.provider ? String(args.provider) : null;

  // Locking: avoid multiple concurrent executors.
  // We only lock implement mode (review is cheap).
  const lockKey = 'executor';
  const lockHolder = `${process.pid}:${crypto.randomBytes(3).toString('hex')}`;
  const force = !!args.force;
  const lockTtlMinutes = args['lock-ttl-min'] ? Number(args['lock-ttl-min']) : 120;
  let lockAcquired = false;
  if (mode !== 'review') {
    const got = await tryAcquireLock(lockKey, lockHolder, lockTtlMinutes, force);
    if (!got.ok) {
      die(`Another executor is running (${got.reason}). Use --force to override.`);
    }
    lockAcquired = true;
  }

  const state = await readJson(STATE_PATH, {
    version: 1,
    providers: { codex: { cooldownUntil: null }, claude: { cooldownUntil: null }, gemini: { cooldownUntil: null } },
    runs: []
  });

  const providers = providerPref ? [providerPref] : ['codex', 'claude', 'gemini'];

  // Choose first provider that exists and is not in cooldown.
  const now = new Date();
  let chosen = null;
  for (const p of providers) {
    if (!(await cmdExists(p))) continue;
    const cdUntil = state.providers?.[p]?.cooldownUntil;
    if (cdUntil) {
      const cd = new Date(cdUntil);
      if (!Number.isNaN(cd.getTime()) && cd > now) continue;
    }
    chosen = p;
    break;
  }

  if (!chosen) {
    const reasons = providers
      .map((p) => {
        const cd = state.providers?.[p]?.cooldownUntil;
        return `${p}: ${cd ? `cooldown until ${cd}` : 'missing or unavailable'}`;
      })
      .join('\n');
    die(`No provider available right now.\n${reasons}`);
  }

  // Worktree
  const noWorktree = !!args['no-worktree'];
  const base = await resolveDefaultBaseRef(args.base ? String(args.base) : null);

  const runId = crypto.randomBytes(4).toString('hex');
  const branch = args.branch ? String(args.branch) : `feat/${pickDefaultBranchSlug(task)}-${runId}`;
  const workdir = args.workdir ? String(args.workdir) : path.join('/tmp', `pm-${branch.replace(/[^a-z0-9-_/]/gi, '-')}`);

  if (!noWorktree) {
    await ensureWorktree(branch, workdir, base);
  }

  const cwd = noWorktree ? WORKSPACE : workdir;

  // Optional: include diff for review mode
  let reviewDiff = '';
  if (args['review-diff']) {
    const baseRef = args['review-diff'] === 'auto'
      ? await resolveDefaultBaseRef(null)
      : String(args['review-diff']);
    const r = await runBash(`cd ${shell(cwd)} && git diff ${shell(baseRef)}..HEAD`, { cwd });
    if (r.code !== 0) {
      die(`Failed to compute diff vs ${baseRef}:\n${r.err || r.out}`);
    }
    reviewDiff = r.out;
  }

  const notes = args.notes ? String(args.notes) : '';
  const prompt = buildPrompt({ task, mode, notes, reviewDiff });

  // Provider-specific local setup
  if (chosen === 'claude') {
    await ensureClaudeLocalPermissions(cwd);
  }

  const cmd = providerCommand(chosen, prompt, { mode });

  // Record run
  state.runs = state.runs || [];
  state.runs.unshift({ id: runId, at: nowIso(), provider: chosen, mode, task, branch: noWorktree ? null : branch, workdir: cwd });
  state.runs = state.runs.slice(0, 50);
  await writeJson(STATE_PATH, state);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        runId,
        provider: chosen,
        mode,
        cwd,
        branch: noWorktree ? null : branch,
        command: cmd
      },
      null,
      2
    ) + '\n'
  );

  if (args['dry-run']) {
    if (lockAcquired) await releaseLock(lockKey, lockHolder);
    return;
  }

  // Run provider command, inheriting stdio so OpenClaw can stream.
  const child = spawn('bash', ['-lc', cmd], {
    cwd,
    env: process.env,
    stdio: ['inherit', 'inherit', 'pipe']
  });

  let errBuf = '';
  child.stderr.on('data', (d) => {
    const s = d.toString('utf8');
    errBuf += s;
    process.stderr.write(s);
  });

  const exitCode = await new Promise((resolve) => child.on('close', resolve));

  if (exitCode !== 0) {
    if (lockAcquired) await releaseLock(lockKey, lockHolder);
    if (isRateLimitText(errBuf)) {
      // Set cooldown for this provider
      const prevCd = state.providers?.[chosen]?.cooldownUntil;
      const prevMins = prevCd ? Math.max(1, Math.round((new Date(prevCd).getTime() - Date.now()) / 60000)) : null;
      const mins = backoffMinutes(prevMins);
      state.providers ??= {};
      state.providers[chosen] ??= { cooldownUntil: null };
      state.providers[chosen].cooldownUntil = addMinutesIso(nowIso(), mins);
      await writeJson(STATE_PATH, state);
      die(`Provider ${chosen} hit rate limit. Cooldown for ~${mins} minutes (until ${state.providers[chosen].cooldownUntil}).`, 2);
    }
    die(`Provider ${chosen} exited with code ${exitCode}`, exitCode || 1);
  }

  if (lockAcquired) await releaseLock(lockKey, lockHolder);
}

main().catch((err) => {
  die(err?.stack || String(err));
});
