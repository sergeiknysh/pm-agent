import Fastify from 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TaskRepo } from './pm/repo.js';
import type { TaskPriority, TaskStatus } from './pm/types.js';
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

function isString(x: unknown): x is string {
  return typeof x === 'string';
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string');
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
      endpoints: ['/api/index', '/api/refresh', '/api/task/:id/status (POST)', '/api/task/:id (PATCH)']
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

  app.patch('/api/task/:id', { preHandler: requireAuth }, async (req) => {
    const id = (req.params as any).id as string;
    const patch = pickPatch(req.body);

    // Whitelist (v1): due, priority, tags, title.
    // status changes are allowed via PATCH too, but UI uses /status.
    const updated = await repo.updateTaskMeta(id, patch);
    await repo.writeIndexFile();
    return { ok: true, task: updated.meta };
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
