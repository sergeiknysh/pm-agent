import path from 'node:path';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import argon2 from 'argon2';

import { ensureDir, fileExists, readText, writeText } from './pm/fs.js';

export type PublicUser = {
  username: string;
  roles: string[];
};

type UsersFile = {
  users: PublicUser[];
};

type ShadowRecord = {
  hash: string;
  updatedAt: string;
};

type ShadowFile = {
  users: Record<string, ShadowRecord>;
};

export type SessionRecord = {
  id: string;
  username: string;
  roles: string[];
  createdAt: string;
  expiresAt: string;
};

export const DEFAULT_SECRETS_ROOT = '/home/sergei/.pm-secrets';

export function resolvePmRoot(env = process.env): string {
  const pmRoot = env.PM_ROOT ? path.resolve(env.PM_ROOT) : path.join(process.cwd(), 'pm');
  return pmRoot;
}

export function resolveSecretsRoot(env = process.env): string {
  const root = env.PM_SECRETS_ROOT ?? DEFAULT_SECRETS_ROOT;
  return path.resolve(root);
}

export function getSessionTtlMs(env = process.env): number {
  const raw = env.PM_SESSION_TTL_HOURS;
  const hours = raw ? Number(raw) : 24 * 7;
  if (!Number.isFinite(hours) || hours <= 0) return 24 * 7 * 60 * 60 * 1000;
  return Math.max(1, hours) * 60 * 60 * 1000;
}

export function usersFilePath(pmRoot: string): string {
  return path.join(pmRoot, 'users', 'users.json');
}

export async function loadUsers(pmRoot: string): Promise<PublicUser[]> {
  const p = usersFilePath(pmRoot);
  if (!(await fileExists(p))) return [];
  const raw = await readText(p);
  const data = JSON.parse(raw) as UsersFile;
  const users = Array.isArray(data.users) ? data.users : [];
  return users.map((u) => ({
    username: String(u.username),
    roles: Array.isArray(u.roles) ? u.roles.map((r) => String(r)) : []
  }));
}

export async function saveUsers(pmRoot: string, users: PublicUser[]): Promise<void> {
  const p = usersFilePath(pmRoot);
  const payload: UsersFile = { users };
  await writeText(p, `${JSON.stringify(payload, null, 2)}\n`);
}

export async function bootstrapUser(pmRoot: string, username: string): Promise<{ user: PublicUser; created: boolean }> {
  const clean = username.trim();
  if (!clean) throw new Error('Username is required');

  const users = await loadUsers(pmRoot);
  const existing = users.find((u) => u.username === clean);
  if (existing) return { user: existing, created: false };

  const roles = clean === 'admin' ? ['admin'] : [];
  const user: PublicUser = { username: clean, roles };
  users.push(user);
  await saveUsers(pmRoot, users);
  return { user, created: true };
}

export function shadowFilePath(secretsRoot: string): string {
  return path.join(secretsRoot, 'shadow.json');
}

async function loadShadow(secretsRoot: string): Promise<ShadowFile> {
  const p = shadowFilePath(secretsRoot);
  if (!(await fileExists(p))) return { users: {} };
  const raw = await readText(p);
  const data = JSON.parse(raw) as ShadowFile;
  if (!data || typeof data !== 'object' || data.users === null || typeof data.users !== 'object') {
    return { users: {} };
  }
  return { users: data.users };
}

async function saveShadow(secretsRoot: string, data: ShadowFile): Promise<void> {
  await ensureDir(secretsRoot);
  const p = shadowFilePath(secretsRoot);
  await writeText(p, `${JSON.stringify(data, null, 2)}\n`);
}

export async function setPassword(secretsRoot: string, username: string, password: string): Promise<void> {
  const clean = username.trim();
  if (!clean) throw new Error('Username is required');
  if (!password) throw new Error('Password is required');

  const shadow = await loadShadow(secretsRoot);
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  shadow.users[clean] = { hash, updatedAt: new Date().toISOString() };
  await saveShadow(secretsRoot, shadow);
}

export async function verifyPassword(secretsRoot: string, username: string, password: string): Promise<boolean> {
  const shadow = await loadShadow(secretsRoot);
  const rec = shadow.users[username];
  if (!rec?.hash) return false;
  return await argon2.verify(rec.hash, password);
}

export function sessionsDir(secretsRoot: string): string {
  return path.join(secretsRoot, 'sessions');
}

export function sessionFilePath(secretsRoot: string, id: string): string {
  return path.join(sessionsDir(secretsRoot), `${id}.json`);
}

export async function createSession(
  secretsRoot: string,
  user: PublicUser,
  ttlMs: number
): Promise<SessionRecord> {
  const id = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + ttlMs).toISOString();
  const session: SessionRecord = {
    id,
    username: user.username,
    roles: user.roles,
    createdAt,
    expiresAt
  };

  const dir = sessionsDir(secretsRoot);
  await ensureDir(dir);
  const p = sessionFilePath(secretsRoot, id);
  await writeText(p, `${JSON.stringify(session, null, 2)}\n`);
  return session;
}

export async function loadSession(secretsRoot: string, id: string): Promise<SessionRecord | null> {
  const p = sessionFilePath(secretsRoot, id);
  if (!(await fileExists(p))) return null;
  try {
    const raw = await readText(p);
    const data = JSON.parse(raw) as SessionRecord;
    if (!data?.expiresAt) return null;
    const exp = new Date(data.expiresAt).getTime();
    if (Number.isNaN(exp) || exp <= Date.now()) {
      await deleteSession(secretsRoot, id);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export async function deleteSession(secretsRoot: string, id: string): Promise<void> {
  const p = sessionFilePath(secretsRoot, id);
  try {
    await fs.unlink(p);
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err;
  }
}
