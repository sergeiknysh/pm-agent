import { apiFetch, readErrorBody } from './apiFetch'

export type MeResponse = { ok: true; user: { username: string; roles: string[] } }
export type LoginResponse = { ok: true; user: { username: string; roles: string[] } }

export async function getMe(): Promise<MeResponse> {
  const res = await apiFetch('/api/me')
  if (!res.ok) {
    const msg = await readErrorBody(res)
    throw new Error(`GET /api/me failed: ${res.status}${msg ? ` ${msg}` : ''}`)
  }
  return (await res.json()) as MeResponse
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    const msg = await readErrorBody(res)
    throw new Error(msg || `Login failed: ${res.status}`)
  }
  return (await res.json()) as LoginResponse
}

export async function logout(): Promise<void> {
  const res = await apiFetch('/api/auth/logout', { method: 'POST' })
  if (!res.ok) {
    const msg = await readErrorBody(res)
    throw new Error(`Logout failed: ${res.status}${msg ? ` ${msg}` : ''}`)
  }
}
