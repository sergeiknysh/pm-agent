import { apiFetch, readErrorBody } from './apiFetch'

export async function fetchProjects(signal?: AbortSignal): Promise<string[]> {
  const res = await apiFetch('/api/projects', { signal })
  if (!res.ok) {
    const msg = await readErrorBody(res)
    throw new Error(`GET /api/projects failed: ${res.status}${msg ? ` ${msg}` : ''}`)
  }
  const data = (await res.json()) as { ok: boolean; projects: string[] }
  return data.projects ?? []
}

export async function createProject(name: string): Promise<void> {
  const res = await apiFetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const msg = await readErrorBody(res)
    throw new Error(`POST /api/projects failed: ${res.status}${msg ? ` ${msg}` : ''}`)
  }
}

export async function deleteProject(name: string): Promise<void> {
  const res = await apiFetch('/api/projects', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const msg = await readErrorBody(res)
    throw new Error(`DELETE /api/projects failed: ${res.status}${msg ? ` ${msg}` : ''}`)
  }
}
