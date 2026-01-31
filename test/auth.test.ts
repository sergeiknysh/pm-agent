import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

import { buildApp } from '../src/server.js';
import { bootstrapUser, saveUsers, setPassword } from '../src/auth.js';

async function makeTempDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'pm-auth-'));
}

test('auth login creates session and /api/me resolves user', async () => {
  const tmp = await makeTempDir();
  const pmRoot = path.join(tmp, 'pm');
  const secretsRoot = path.join(tmp, 'secrets');
  await fs.mkdir(path.join(pmRoot, 'users'), { recursive: true });

  await saveUsers(pmRoot, [{ username: 'alice', roles: ['admin'] }]);
  await setPassword(secretsRoot, 'alice', 'secret');

  const app = await buildApp({ pmRoot, secretsRoot, sessionTtlMs: 60 * 60 * 1000, cookieSecure: false });

  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'alice', password: 'secret' }
  });
  assert.equal(login.statusCode, 200);

  const setCookie = login.headers['set-cookie'];
  assert.ok(setCookie);
  const rawCookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const sessionCookie = rawCookie.split(';')[0];

  const me = await app.inject({
    method: 'GET',
    url: '/api/me',
    headers: { cookie: sessionCookie }
  });
  assert.equal(me.statusCode, 200);
  const meBody = me.json() as any;
  assert.equal(meBody.user.username, 'alice');

  const logout = await app.inject({
    method: 'POST',
    url: '/api/auth/logout',
    headers: { cookie: sessionCookie }
  });
  assert.equal(logout.statusCode, 200);

  const meAfter = await app.inject({
    method: 'GET',
    url: '/api/me',
    headers: { cookie: sessionCookie }
  });
  assert.equal(meAfter.statusCode, 401);

  await app.close();
});

test('bootstrapUser creates admin role and is idempotent', async () => {
  const tmp = await makeTempDir();
  const pmRoot = path.join(tmp, 'pm');
  await fs.mkdir(pmRoot, { recursive: true });

  const first = await bootstrapUser(pmRoot, 'admin');
  assert.equal(first.created, true);
  assert.deepEqual(first.user.roles, ['admin']);

  const second = await bootstrapUser(pmRoot, 'admin');
  assert.equal(second.created, false);
  assert.equal(second.user.username, 'admin');
});
