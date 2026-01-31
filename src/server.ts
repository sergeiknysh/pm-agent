import Fastify from 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TaskRepo } from './pm/repo.js';
import type { ParsedTaskFile, TaskPriority, TaskStatus } from './pm/types.js';
import {
  createSession,
  getSessionTtlMs,
  loadSession,
  loadUsers,
  resolvePmRoot,
  resolveSecretsRoot,
  verifyPassword,
  deleteSession
} from './auth.js';
import './auth-types.js';

const STATUS_VALUES: TaskStatus[] = ['todo', 'doing', 'blocked', 'done'];
const PRIORITY_VALUES: TaskPriority[] = ['P0', 'P1', 'P2', 'P3'];

function toTaskDetailsResponse(task: ParsedTaskFile): { meta: ParsedTaskFile['meta']; body: string } {
  return { meta: task.meta, body: task.body };
}

function isString(x: unknown): x is string {
  return typeof x === 'string';
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string');
}

function normalizeProjectName(input: unknown): string {
  if (!isString(input)) throw new Error('project must be a string');
  const name = input.trim();
  if (!name) throw new Error('project must be a non-empty string');
  if (name === 'all') throw new Error("'all' is reserved");
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new Error('invalid project name');
  }
  if (!/^[a-z0-9][a-z0-9-_]*$/i.test(name)) {
    throw new Error('invalid project name (allowed: letters, numbers, dash, underscore)');
  }
  return name;
}

function pickPatch(body: unknown): {
  status?: TaskStatus;
  due?: string;
  priority?: TaskPriority;
  tags?: string[];
  title?: string;
} {
  if (typeof body !== 'object' || body === null) return {};
  const b = body as Record<string, unknown>;

  const out: {
    status?: TaskStatus;
    due?: string;
    priority?: TaskPriority;
    tags?: string[];
    title?: string;
  } = {};

  if (b.status !== undefined) {
    if (!isString(b.status) || !STATUS_VALUES.includes(b.status as TaskStatus)) {
      throw new Error(`Invalid status: ${String(b.status)}`);
    }
    out.status = b.status as TaskStatus;
  }

  if (b.due !== undefined) {
    if (!isString(b.due)) throw new Error('due must be a string');
    out.due = b.due;
  }

  if (b.priority !== undefined) {
    if (!isString(b.priority) || !PRIORITY_VALUES.includes(b.priority as TaskPriority)) {
      throw new Error(`Invalid priority: ${String(b.priority)}`);
    }
    out.priority = b.priority as TaskPriority;
  }

  if (b.tags !== undefined) {
    if (!isStringArray(b.tags)) throw new Error('tags must be a string[]');
    out.tags = b.tags;
  }

  if (b.title !== undefined) {
    if (!isString(b.title) || b.title.trim() === '') throw new Error('title must be a non-empty string');
    out.title = b.title;
  }

  return out;
}

function pickCreateTaskBody(body: unknown): {
  project: string;
  title: string;
  priority?: TaskPriority;
  due?: string;
  tags?: string[];
  estimate?: string;
  body?: string;
} {
  if (typeof body !== 'object' || body === null) throw new Error('body must be an object');
  const b = body as Record<string, unknown>;

  const project = normalizeProjectName(b.project);

  if (!isString(b.title) || b.title.trim() === '') {
    throw new Error('title must be a non-empty string');
  }
  const title = b.title;

  const out: {
    project: string;
    title: string;
    priority?: TaskPriority;
    due?: string;
    tags?: string[];
    estimate?: string;
    body?: string;
  } = { project, title };

  if (b.priority !== undefined && b.priority !== null && b.priority !== '') {
    if (!isString(b.priority) || !PRIORITY_VALUES.includes(b.priority as TaskPriority)) {
      throw new Error(`Invalid priority: ${String(b.priority)}`);
    }
    out.priority = b.priority as TaskPriority;
  }

  if (b.due !== undefined && b.due !== null && b.due !== '') {
    if (!isString(b.due)) throw new Error('due must be a string');
    out.due = b.due;
  }

  if (b.tags !== undefined && b.tags !== null) {
    if (!isStringArray(b.tags)) throw new Error('tags must be a string[]');
    out.tags = b.tags;
  }

  if (b.estimate !== undefined && b.estimate !== null && b.estimate !== '') {
    if (!isString(b.estimate)) throw new Error('estimate must be a string');
    out.estimate = b.estimate;
  }

  if (b.body !== undefined && b.body !== null && b.body !== '') {
    if (!isString(b.body)) throw new Error('body must be a string');
    out.body = b.body;
  }

  return out;
}

type ServerOptions = {
  pmRoot?: string;
  secretsRoot?: string;
  sessionTtlMs?: number;
  cookieSecure?: boolean;
};

export async function buildApp(opts: ServerOptions = {}) {
  const app = Fastify({ logger: true });

  const pmRoot = opts.pmRoot ?? resolvePmRoot();
  const secretsRoot = opts.secretsRoot ?? resolveSecretsRoot();
  const sessionTtlMs = opts.sessionTtlMs ?? getSessionTtlMs();
  const cookieSecure =
    opts.cookieSecure ??
    (process.env.PM_SESSION_SECURE === '1' || process.env.PM_SESSION_SECURE === 'true');

  const repo = new TaskRepo({ pmRoot });

  if (process.env.CORS === '1' || process.env.CORS === 'true') {
    await app.register(cors, {
      origin: process.env.CORS_ORIGIN ?? true
    });
  }

  await app.register(cookie);

  app.addHook('preHandler', async (req) => {
    const sessionId = req.cookies?.pm_session;
    if (!sessionId) return;
    const session = await loadSession(secretsRoot, sessionId);
    if (!session) return;
    req.sessionId = sessionId;
    req.user = { username: session.username, roles: session.roles };
  });

  async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
    if (!req.user) {
      reply.status(401).send({ ok: false, error: 'Unauthorized' });
      return;
    }
  }

  async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
    if (!req.user) {
      reply.status(401).send({ ok: false, error: 'Unauthorized' });
      return;
    }
    if (!req.user.roles.includes('admin')) {
      reply.status(403).send({ ok: false, error: 'Forbidden' });
      return;
    }
  }

  app.get('/', async () => {
    return {
      ok: true,
      service: 'pm-as-files',
      endpoints: [
        '/api/index',
        '/api/refresh',
        '/api/projects (GET/POST/DELETE)',
        '/api/tasks (POST)',
        '/api/task (POST)',
        '/api/task/:id (GET/PATCH)',
        '/api/task/:id/status (POST)',
        '/api/task/:id/log (POST)'
      ]
    };
  });

  app.get('/favicon.ico', async (_req, reply) => {
    reply.code(204).send();
  });

  app.get('/api/index', async (_req, reply) => {
    const indexPath = path.join(pmRoot, '_meta', 'index.json');

    try {
      const raw = await fs.readFile(indexPath, 'utf8');
      reply.type('application/json').send(raw);
      return;
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err;
    }

    const { entries, outPath } = await repo.writeIndexFile();
    const raw = await fs.readFile(outPath, 'utf8');
    reply.type('application/json').send(raw);
    return;
  });

  app.post('/api/refresh', { preHandler: requireAuth }, async () => {
    const { entries } = await repo.writeIndexFile();
    return { ok: true, count: entries.length };
  });

  app.get('/api/projects', { preHandler: requireAuth }, async () => {
    const projects = await repo.listProjects();
    return { ok: true, projects };
  });

  app.post('/api/projects', { preHandler: requireAdmin }, async (req) => {
    const body = req.body as Record<string, unknown> | null;
    const name = normalizeProjectName(body?.name);
    await repo.createProject(name);
    return { ok: true, project: name };
  });

  app.delete('/api/projects', { preHandler: requireAdmin }, async (req) => {
    const body = req.body as Record<string, unknown> | null;
    const name = normalizeProjectName(body?.name);
    await repo.deleteProject(name);
    await repo.writeIndexFile();
    return { ok: true };
  });

  // Back-compat / convenience.
  app.delete('/api/projects/:name', { preHandler: requireAdmin }, async (req) => {
    const name = normalizeProjectName((req.params as any).name);
    await repo.deleteProject(name);
    await repo.writeIndexFile();
    return { ok: true };
  });

  async function createTaskHandler(req: FastifyRequest) {
    const input = pickCreateTaskBody(req.body);

    // Prevent accidental creation under a typo'd project.
    const projects = await repo.listProjects();
    if (!projects.includes(input.project)) {
      throw new Error(`Unknown project: ${input.project}`);
    }

    const created = await repo.createTask(input);
    await repo.writeIndexFile();
    return { ok: true, task: created.meta };
  }

  // Preferred: plural.
  app.post('/api/tasks', { preHandler: requireAuth }, async (req) => {
    return createTaskHandler(req);
  });

  // Back-compat / convenience.
  app.post('/api/task', { preHandler: requireAuth }, async (req) => {
    return createTaskHandler(req);
  });

  app.post('/api/task/:id/status', { preHandler: requireAuth }, async (req) => {
    const id = (req.params as any).id as string;
    const patch = pickPatch(req.body);

    if (patch.status === undefined) {
      throw new Error('Missing body.status');
    }

    const updated = await repo.updateTaskMeta(id, { status: patch.status });
    await repo.writeIndexFile();
    return { ok: true, task: updated.meta };
  });

  app.get('/api/task/:id', { preHandler: requireAuth }, async (req) => {
    const id = (req.params as any).id as string;
    const task = await repo.findTaskById(id);
    if (!task) throw new Error(`Task not found: ${id}`);
    return { ok: true, task: toTaskDetailsResponse(task) };
  });

  app.patch('/api/task/:id', { preHandler: requireAuth }, async (req) => {
    const id = (req.params as any).id as string;
    const patch = pickPatch(req.body);

    // Whitelist (v1): due, priority, tags, title.
    // status changes are allowed via PATCH too, but UI uses /status.
    const updated = await repo.updateTaskMeta(id, patch);
    await repo.writeIndexFile();
    return { ok: true, task: updated.meta };
  });

  app.post('/api/task/:id/log', { preHandler: requireAuth }, async (req) => {
    const id = (req.params as any).id as string;
    const body = req.body as Record<string, unknown> | null;
    const entry = typeof body?.entry === 'string' ? body.entry.trim() : '';
    if (!entry) throw new Error('Missing body.entry');

    const updated = await repo.appendLog(id, entry);
    await repo.writeIndexFile();
    return { ok: true, task: toTaskDetailsResponse(updated) };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = req.body as Record<string, unknown> | null;
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!username || !password) {
      reply.status(400).send({ ok: false, error: 'username and password required' });
      return;
    }

    const users = await loadUsers(pmRoot);
    const user = users.find((u) => u.username === username);
    if (!user) {
      reply.status(401).send({ ok: false, error: 'Invalid credentials' });
      return;
    }

    const ok = await verifyPassword(secretsRoot, username, password);
    if (!ok) {
      reply.status(401).send({ ok: false, error: 'Invalid credentials' });
      return;
    }

    const session = await createSession(secretsRoot, user, sessionTtlMs);
    reply.setCookie('pm_session', session.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSecure,
      path: '/',
      maxAge: Math.floor(sessionTtlMs / 1000)
    });

    reply.send({ ok: true, user: { username: user.username, roles: user.roles } });
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const sessionId = req.cookies?.pm_session;
    if (sessionId) {
      await deleteSession(secretsRoot, sessionId);
    }
    reply.clearCookie('pm_session', { path: '/' });
    reply.send({ ok: true });
  });

  app.get('/api/me', async (req, reply) => {
    if (!req.user) {
      reply.status(401).send({ ok: false, error: 'Unauthorized' });
      return;
    }
    reply.send({ ok: true, user: req.user });
  });

  // Error handling: return JSON consistently.
  app.setErrorHandler((err, _req, reply) => {
    const msg = err instanceof Error ? err.message : String(err);
    const statusCode = msg.startsWith('Task not found') ? 404 : 400;
    reply.status(statusCode).send({ ok: false, error: msg });
  });

  return app;
}

async function main(): Promise<void> {
  const app = await buildApp();
  const host = process.env.HOST ?? '127.0.0.1';
  const port = process.env.PORT ? Number(process.env.PORT) : 8787;
  await app.listen({ host, port });
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
